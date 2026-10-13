import type {ClientInbound, ClientOutbound} from "../shared/clients"
import {CLIENT_CAPABILITIES, CLIENT_SOCKET_PATH, CLIENT_WIRE_MAX_BYTES, CLIENT_CAPTURE_CHUNK_CHARS, isClientCapture, isClientAction, clientId} from "../shared/clients"
import type {ClientAnnotationFeedback, ClientCacheInventory, ClientDescriptor, ClientInspection, ClientLogs, ClientViewActionResult, ClientFailureCode, ClientStatus, ClientTrace, ClientViewAction, ClientViewInspection, ClientDiagnosticsOptions, ClientDiagnostics, ClientCapture, ClientCommandValue} from "@metafor/types/cosmos/client"
import {createServiceDiagnosticsClient, readClientCache} from "./service-diagnostics"
import {createClientLogRecorder} from "./client-logs"

type Socket = Pick<WebSocket, "readyState" | "bufferedAmount" | "send" | "close" | "addEventListener">
type Surface = Pick<EventTarget, "addEventListener" | "removeEventListener">
export interface BrowserClientOptions {
  url?: string
  socket?: (url: string) => Socket
  window?: Surface & {innerWidth: number; innerHeight: number; devicePixelRatio: number}
  document?: Surface & {visibilityState: string; hasFocus(): boolean}
  console?: Console
  inspect(signal: AbortSignal): ClientViewInspection | null | Promise<ClientViewInspection | null>
  act(action: ClientViewAction, signal: AbortSignal): unknown | Promise<unknown>
  diagnostics?(request: ClientDiagnosticsOptions, signal: AbortSignal): ClientDiagnostics | Promise<ClientDiagnostics>
  capture?(signal: AbortSignal): ClientCapture | Promise<ClientCapture>
  heartbeatMs?: number
  reconnectMs?: number
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const id = clientId
const action = isClientAction

/**
Регистрирует существующий Window до готовности Visual. Same-origin WS передаёт
закрытые команды; identity соединения закрепляет ответы и отмену. Начальное
наблюдение focus передаётся один раз за Document; trusted activity, heartbeat
и действия агентов различаются. Pagehide/disconnect отменяют pending callbacks;
BFCache resume получает новую incarnation соединения. Журнал начинается только
после установки entrypoint. Проверки: [browser-clients.spec.ts](../spec/browser-clients.spec.ts).
*/
export function createBrowserClient(options: BrowserClientOptions) {
  const view = options.window ?? window
  const page = options.document ?? document
  const endpoint = new URL(options.url ?? CLIENT_SOCKET_PATH, globalThis.location?.href ?? "http://localhost")
  if (!["http:", "https:", "ws:", "wss:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error("Invalid client socket endpoint")
  const ownOrigin = globalThis.location?.origin
  if (ownOrigin && endpoint.origin.replace(/^ws/u, "http") !== ownOrigin) throw new Error("Client transport requires the same origin")
  endpoint.protocol = endpoint.protocol === "https:" || endpoint.protocol === "wss:" ? "wss:" : "ws:"
  const logs = createClientLogRecorder({console: options.console ?? console, events: view})
  const service = createServiceDiagnosticsClient()
  let serviceTimer: ReturnType<typeof setInterval> | undefined
  let servicePolling = false, serviceCursor = 0, serviceProducer: string | undefined
  let phase = "booting"
  let traceSequence = 0
  const traces: ClientTrace[] = []
  let current: Socket | null = null
  let registered: ClientDescriptor | null = null
  let lastDescriptor: ClientDescriptor | null = null
  let clientId: string | null = null
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let handshake: ReturnType<typeof setTimeout> | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let running = false
  let disposed = false
  let lastActivity = -Infinity
  let initialRegistration = true
  const pending = new Map<string, {controller: AbortController; timer: ReturnType<typeof setTimeout>}>()
  const feedbackPending = new Map<string, {input: ClientAnnotationFeedback; content: string; sentConnection?: string; resolve(value: import("@metafor/types/metafor/agents").AgentFeedbackReceipt): void; reject(error: Error): void; promise: Promise<import("@metafor/types/metafor/agents").AgentFeedbackReceipt>; cleanup(): void}>()
  const transmitFeedback = () => {
    if (!registered) return
    for (const work of feedbackPending.values()) {
      if (work.input.request.correlation.clientId !== registered.id || work.input.world.root !== registered.world.root || work.input.world.cutId !== registered.world.cutId) {
        work.reject(new Error("Pinned feedback client/world changed")); work.cleanup(); feedbackPending.delete(work.input.request.id); continue
      }
      if (work.sentConnection !== registered.connectionId && send({type: "feedback", connectionId: registered.connectionId, feedback: work.input})) work.sentConnection = registered.connectionId
    }
  }
  const completed = new Set<string>()
  const remember = (requestId: string) => {
    completed.add(requestId)
    if (completed.size > 256) completed.delete(completed.values().next().value!)
  }
  const trace = (name: string, message?: string) => {
    traces.push({sequence: ++traceSequence, phase: name.slice(0, 80), ...(message ? {message: message.slice(0, 512)} : {})})
    if (traces.length > 64) traces.shift()
  }
  const status = (): ClientStatus => ({visible: page.visibilityState === "visible", focused: page.hasFocus(), boot: {phase, trace: structuredClone(traces)}})
  const send = (message: ClientInbound) => {
    if (!current || current.readyState !== 1) return false
    const text = JSON.stringify(message)
    if (new TextEncoder().encode(text).byteLength > CLIENT_WIRE_MAX_BYTES || current.bufferedAmount > CLIENT_WIRE_MAX_BYTES) return false
    try {
      current.send(text)
      return true
    } catch {return false}
  }
  const inspection = async (signal: AbortSignal): Promise<ClientInspection> => ({schema: "cosmos/client-inspection/v1", version: 1,
    status: status(), viewport: {width: Math.max(0, view.innerWidth), height: Math.max(0, view.innerHeight), devicePixelRatio: Math.max(.1, view.devicePixelRatio)}, view: await options.inspect(signal)})
  const clearPending = () => {
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.controller.abort(new Error("Client disconnected"))
    }
    pending.clear()
    completed.clear()
  }
  const activity = (reason: "focus" | "observed-focus" | "pointer" | "keyboard") => {
    if (!registered || !running || page.visibilityState !== "visible") return
    const now = Date.now()
    if (reason !== "observed-focus" && now - lastActivity < 300) return
    lastActivity = now
    send({type: "activity", connectionId: registered.connectionId, event: reason, status: status()})
  }
  const command = async (message: Extract<ClientOutbound, {type: "command"}>) => {
    const connection = registered
    if (!connection || message.connectionId !== connection.connectionId || !id(message.requestId)) return
    if (pending.has(message.requestId) || completed.has(message.requestId)) return
    const reply = (value: ClientCommandValue | undefined, failure?: string, code: ClientFailureCode = "client_error") => {
      if (registered !== connection || !pending.has(message.requestId)) return
      const item = pending.get(message.requestId)!
      pending.delete(message.requestId)
      clearTimeout(item.timer)
      remember(message.requestId)
      if (failure) send({type: "reply", connectionId: connection.connectionId, requestId: message.requestId, ok: false, error: {code, message: failure.slice(0, 512)}})
      else if (!send({type: "reply", connectionId: connection.connectionId, requestId: message.requestId, ok: true, value: value!})) {
        send({type: "reply", connectionId: connection.connectionId, requestId: message.requestId, ok: false, error: {code: "invalid_reply", message: "Client reply exceeds transport capacity"}})
      }
    }
    if (pending.size >= 8 || !Number.isFinite(message.deadline) || message.deadline <= Date.now()) {
      remember(message.requestId)
      send({type: "reply", connectionId: connection.connectionId, requestId: message.requestId, ok: false, error: {code: "timeout", message: "Client command deadline or capacity exceeded"}})
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      reply(undefined, "Client command timed out", "timeout")
      controller.abort(new Error("Client command timed out"))
    }, Math.min(15000, message.deadline - Date.now()))
    pending.set(message.requestId, {controller, timer})
    try {
      if (message.operation === "inspect") reply(await inspection(controller.signal))
      else if (message.operation === "logs") reply(message.source === "service" ? await service.logs(message.afterSequence, message.limit, message.producerId) : logs.read(message.afterSequence, message.limit))
      else if (message.operation === "cache") reply(await readClientCache(message))
      else if (message.operation === "diagnostics" && options.diagnostics) reply(await options.diagnostics(message, controller.signal))
      else if (message.operation === "capture" && options.capture) {
        const value = await options.capture(controller.signal)
        if (!isClientCapture(value)) throw new Error("Invalid bounded PNG result")
        const transmit = async (frame: ClientInbound) => {
          while (current && current.bufferedAmount > CLIENT_CAPTURE_CHUNK_CHARS) {
            controller.signal.throwIfAborted()
            await new Promise(resolve => setTimeout(resolve, 5))
          }
          controller.signal.throwIfAborted()
          if (registered !== connection || !pending.has(message.requestId) || !send(frame)) throw new Error("Capture connection changed")
        }
        const {pngBase64, ...metadata} = value
        await transmit({type: "capture-start", connectionId: connection.connectionId, requestId: message.requestId, metadata, characters: pngBase64.length})
        for (let offset = 0; offset < pngBase64.length; offset += CLIENT_CAPTURE_CHUNK_CHARS) {
          await transmit({type: "capture-chunk", connectionId: connection.connectionId, requestId: message.requestId, offset, data: pngBase64.slice(offset, offset + CLIENT_CAPTURE_CHUNK_CHARS)})
        }
        await transmit({type: "capture-end", connectionId: connection.connectionId, requestId: message.requestId})
        const work = pending.get(message.requestId)
        if (work) {clearTimeout(work.timer); pending.delete(message.requestId); remember(message.requestId)}
      }
      else if (message.operation === "act" && action(message.action)) {
        await options.act(message.action, controller.signal)
        controller.signal.throwIfAborted()
        reply({schema: "cosmos/client-action-result/v1", version: 1, status: "dispatched", inspection: await inspection(controller.signal)})
      } else reply(undefined, "Unsupported client command")
    } catch (error) {
      if (!controller.signal.aborted) logs.record("error", ["Client operation failed", error])
      let code: ClientFailureCode = "client_error"
      try {
        if (error !== null && typeof error === "object" && ["stale_control", "unsupported", "disconnected"].includes(Object.getOwnPropertyDescriptor(error, "code")?.value)) code = Object.getOwnPropertyDescriptor(error, "code")!.value
      } catch {}
      reply(undefined, code === "stale_control" ? "Client control is stale; inspect the current view" : "Client operation failed", code)
    }
  }
  const receive = (event: MessageEvent) => {
    if (typeof event.data !== "string" || new TextEncoder().encode(event.data).byteLength > CLIENT_WIRE_MAX_BYTES) {
      current?.close(1008, "Invalid client frame")
      return
    }
    let message: unknown
    try {message = JSON.parse(event.data)} catch {
      current?.close(1008, "Invalid client JSON")
      return
    }
    if (!object(message)) return
    if (message.type === "feedback-receipt" && registered && message.connectionId === registered.connectionId && typeof message.id === "string") {
      const work = feedbackPending.get(message.id)
      if (!work) return
      if (message.ok === true && object(message.receipt) && message.receipt.id === message.id && message.receipt.accepted === true && typeof message.receipt.replayed === "boolean")
        work.resolve({id: message.id, accepted: true, replayed: message.receipt.replayed})
      else if (message.ok === false && object(message.error) && typeof message.error.message === "string") work.reject(new Error(message.error.message.slice(0, 512)))
      else return
      work.cleanup(); feedbackPending.delete(message.id)
      return
    }
    if (message.type === "registered" && message.version === 1 && object(message.client) && id(message.client.id) && id(message.client.connectionId)) {
      if (registered) {
        current?.close(1008, "Duplicate client registration")
        return
      }
      clearTimeout(handshake)
      registered = message.client as unknown as ClientDescriptor
      lastDescriptor = registered
      clientId = registered.id
      trace("registered")
      transmitFeedback()
      if (initialRegistration) {
        initialRegistration = false
        if (page.hasFocus() && page.visibilityState === "visible") activity("observed-focus")
      }
    } else if (message.type === "command") void command(message as unknown as Extract<ClientOutbound, {type: "command"}>)
    else if (message.type === "cancel" && registered && message.connectionId === registered.connectionId && id(message.requestId)) {
      const item = pending.get(message.requestId)
      if (item) {
        pending.delete(message.requestId)
        clearTimeout(item.timer)
        item.controller.abort(new Error("Client command cancelled"))
        remember(message.requestId)
      }
    }
  }
  const connect = () => {
    if (!running || disposed || current) return
    clearTimeout(retry)
    let socket: Socket
    try {socket = (options.socket ?? (url => new WebSocket(url)))(endpoint.href)}
    catch {
      trace("socket.error")
      retry = setTimeout(connect, options.reconnectMs ?? 1000)
      return
    }
    current = socket
    handshake = setTimeout(() => {if (current === socket && !registered) socket.close(1008, "Client registration timed out")}, 10000)
    socket.addEventListener("open", () => {
      if (current !== socket || !running) return
      send({type: "hello", version: 1, clientId, kind: "Window", capabilities: CLIENT_CAPABILITIES.filter(capability => capability !== "diagnostics" && capability !== "capture" || capability === "diagnostics" && !!options.diagnostics || capability === "capture" && !!options.capture), status: status()})
      heartbeat = setInterval(() => {if (registered) {send({type: "heartbeat", connectionId: registered.connectionId, status: status()}); transmitFeedback()}}, options.heartbeatMs ?? 10000)
    })
    socket.addEventListener("message", event => {if (current === socket) receive(event as MessageEvent)})
    socket.addEventListener("error", () => {if (current === socket) trace("socket.error")})
    socket.addEventListener("close", () => {
      if (current !== socket) return
      current = null
      registered = null
      clearInterval(heartbeat)
      clearTimeout(handshake)
      clearPending()
      trace("disconnect")
      if (running && !disposed) retry = setTimeout(connect, options.reconnectMs ?? 1000)
    })
  }
  const stop = () => {
    running = false
    clearTimeout(retry)
    clearInterval(serviceTimer)
    clearInterval(heartbeat)
    clearTimeout(handshake)
    clearPending()
    registered = null
    const socket = current
    current = null
    if (socket) trace("disconnect", "suspended")
    socket?.close(1000, "Window suspended")
  }
  const start = () => {
    if (disposed || running) return
    running = true
    trace("start")
    const pollService = async () => {
      if (servicePolling || !registered || !globalThis.navigator?.serviceWorker?.controller) return
      servicePolling = true
      try {
        const snapshot = await service.logs(serviceCursor, 64, serviceProducer)
        if (serviceProducer !== snapshot.owner?.producerId) {serviceProducer = snapshot.owner?.producerId; serviceCursor = 0}
        for (const entry of snapshot.entries) if (entry.level === "error") trace(entry.message.includes("service.unhandledrejection") ? "service.unhandledrejection" : "service.error", `${serviceProducer}#${entry.sequence}: ${entry.message.slice(0, 300)}`)
        serviceCursor = snapshot.cursor
        if (registered) send({type: "heartbeat", connectionId: registered.connectionId, status: status()})
      } catch {serviceProducer = undefined; serviceCursor = 0}
      finally {servicePolling = false}
    }
    serviceTimer = setInterval(() => {void pollService()}, 3000)
    void pollService()
    connect()
  }
  const pointer = (event: Event) => {if (event.isTrusted) activity("pointer")}
  const keyboard = (event: Event) => {if (event.isTrusted) activity("keyboard")}
  const focus = (event: Event) => {if (event.isTrusted && page.hasFocus()) activity("focus")}
  const reportStatus = () => {if (registered) send({type: "heartbeat", connectionId: registered.connectionId, status: status()})}
  const visibility = () => {
    trace(`visibility.${page.visibilityState}`)
    reportStatus()
  }
  const pageshow = (event: Event) => {
    trace("pageshow", (event as PageTransitionEvent).persisted ? "persisted" : "fresh")
    start()
  }
  const pagehide = (event: Event) => {
    trace("pagehide", (event as PageTransitionEvent).persisted ? "persisted" : "final")
    stop()
  }
  const errored = () => {trace("window.error"); reportStatus()}
  const rejected = () => {trace("window.unhandledrejection"); reportStatus()}
  const listeners: [Surface, string, EventListener][] = [[view, "pointerdown", pointer], [view, "pointermove", pointer], [view, "keydown", keyboard], [view, "focus", focus],
    [view, "pageshow", pageshow], [view, "pagehide", pagehide], [view, "error", errored], [view, "unhandledrejection", rejected], [page, "visibilitychange", visibility]]
  for (const [target, name, listener] of listeners) target.addEventListener(name, listener)
  return {start, stop, trace, getStatus: status, logs: logs.read,
    getDescriptor: () => registered ? structuredClone(registered) : null,
    feedback(input: ClientAnnotationFeedback, signal: AbortSignal) {
      signal.throwIfAborted()
      const pinned = structuredClone(input), content = JSON.stringify(pinned)
      const owner = registered ?? lastDescriptor
      if (disposed || !owner || pinned.request.correlation.clientId !== owner.id || pinned.world.root !== owner.world.root || pinned.world.cutId !== owner.world.cutId)
        return Promise.reject(new Error("Pinned feedback client/world unavailable"))
      const prior = feedbackPending.get(pinned.request.id)
      if (prior) return prior.content === content ? prior.promise : Promise.reject(new Error("Feedback id already binds another immutable payload"))
      if (feedbackPending.size >= 32) return Promise.reject(new Error("Feedback pending capacity exceeded"))
      const deferred = Promise.withResolvers<import("@metafor/types/metafor/agents").AgentFeedbackReceipt>()
      const aborted = () => {const work = feedbackPending.get(pinned.request.id); if (!work) return; feedbackPending.delete(pinned.request.id); work.cleanup(); work.reject(new Error("Feedback delivery cancelled; accepted outcome may be unknown"))}
      signal.addEventListener("abort", aborted, {once: true})
      feedbackPending.set(pinned.request.id, {input: pinned, content, ...deferred, cleanup: () => signal.removeEventListener("abort", aborted)})
      transmitFeedback()
      return deferred.promise
    },
    setPhase(value: string) {
      phase = value.slice(0, 80)
      trace(phase)
      reportStatus()
    },
    fail(error: unknown) {
      phase = "failed"
      const failure = logs.record("error", ["release-main initialization failed", error])
      trace("failed", failure?.message)
      reportStatus()
    },
    dispose() {
      if (disposed) return
      disposed = true
      stop()
      for (const [target, name, listener] of listeners) target.removeEventListener(name, listener)
      logs.dispose()
      service.dispose()
      for (const work of feedbackPending.values()) {work.cleanup(); work.reject(new Error("Window feedback delivery closed; accepted outcome may be unknown"))}
      feedbackPending.clear()
    },
  }
}
