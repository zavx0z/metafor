/** Release владеет временными соединениями Window и закрытыми Oracle methods. @packageDocumentation */
import {OracleRpcPeer} from "shared/transport/oracle"
import {createLocalOracleChannelPair} from "../../../quantum/dark/oracle/local"
import {READ_GRAPH_METHOD} from "@metafor/types/metafor/graph"
import {DARK_FORCE_HISTORY_READ_METHOD, type DarkForceHistoryReadReceipt} from "shared/protocol/metafor/observation"
import type {ClientCommandReceipt, ClientDescriptor, ClientEvents, ClientFailureCode, ClientSelector, ClientsReceipt, ClientTarget, ClientViewAction, ClientWorld} from "@metafor/types/cosmos/client"
import {CLIENT_SOCKET_PATH, CLIENTS_READ_METHOD, CLIENT_INSPECT_METHOD, CLIENT_ACT_METHOD, CLIENT_LOGS_METHOD, CLIENT_EVENTS_METHOD, CLIENT_CACHE_METHOD, CLIENT_DIAGNOSTICS_METHOD, CLIENT_CAPTURE_METHOD, CLIENT_WIRE_MAX_BYTES,
  clientRecord, isClientAction, isClientSelector, isClientResult, parseClientInbound, type ClientOutbound, type ClientOperation, type ClientCaptureMetadata} from "../shared/clients"
import {createClientFeedbackBridge} from "./client-feedback"
import type {AgentFeedbackReceipt} from "@metafor/types/metafor/agents"
import type {ClientAnnotationFeedback} from "@metafor/types/cosmos/client"
import {authorizeAgentRequest} from "./agents"

export type ClientSocketData = {kind: "cosmos-client", connectionId: string}
type Socket = Pick<Bun.ServerWebSocket<ClientSocketData>, "data" | "send" | "close">
type Entry = {socket: Socket, world: ClientWorld, descriptor?: ClientDescriptor, traceSequence?: number, expires: ReturnType<typeof setTimeout>}
type Pending = {capture?: {metadata: ClientCaptureMetadata; characters: number; received: number; chunks: string[]}, entry: Entry, operation: ClientOperation, finish(receipt: ClientCommandReceipt): void, timer: ReturnType<typeof setTimeout>}
type Host = {requestIP(request: Request): {address: string} | null, upgrade(request: Request, options: {data: ClientSocketData}): boolean}
const sameWorld = (a: ClientWorld, b: ClientWorld) => a.root === b.root && a.cutId === b.cutId

/**
Один socket получает одну incarnation и принадлежит одному миру. Сервер
упорядочивает человеческую активность; heartbeat и Oracle commands её не меняют.
Команда закрепляется до ожидания проверки мира и не повторяется. Boot phases и
Window errors сохраняются в ограниченном журнале событий. Проверки настоящего
Oracle router и loopback sockets: [clients.spec.ts](../spec/clients.spec.ts).
*/
export function createClientRegistry(options: {world(): Promise<ClientWorld>, admitted?: () => boolean, instance?: string, timeoutMs?: number, heartbeatMs?: number, feedback?: (input: ClientAnnotationFeedback) => Promise<AgentFeedbackReceipt>}) {
  const instance = options.instance ?? `${process.pid}-${Date.now()}`
  const entries = new Map<string, Entry>()
  const pending = new Map<string, Pending>()
  const events: ClientEvents["entries"] = []
  let eventSequence = 0, connectionSequence = 0, clientSequence = 0, requestSequence = 0
  let closed = false
  let readingWorld: Promise<ClientWorld> | undefined
  const readWorld = () => readingWorld ??= options.world().finally(() => {readingWorld = undefined})
  const ready = () => {if (closed || options.admitted?.() === false) throw new Error("Client world is unavailable")}
  const target = (entry: Entry): ClientTarget => ({clientId: entry.descriptor!.id, connectionId: entry.socket.data.connectionId})
  const lastActive = (): Entry | undefined => [...entries.values()].filter(entry => entry.descriptor?.lastActivitySequence != null)
    .sort((a, b) => b.descriptor!.lastActivitySequence! - a.descriptor!.lastActivitySequence!)[0]
  const event = (type: ClientEvents["entries"][number]["type"], entry: Entry, details: {phase?: string, message?: string, feedbackId?: string} = {}) => {
    events.push({sequence: ++eventSequence, type, target: target(entry), ...details})
    if (events.length > 256) events.shift()
  }
  const observeStatus = (entry: Entry, status: ClientDescriptor["status"], previousPhase?: string) => {
    if (status.boot.phase !== previousPhase) event(status.boot.phase === "failed" ? "boot.failed" : "boot.phase", entry, {phase: status.boot.phase,
      ...(status.boot.trace.findLast(item => item.phase === "failed")?.message ? {message: status.boot.trace.findLast(item => item.phase === "failed")!.message} : {})})
    for (const trace of status.boot.trace) {
      if (trace.sequence <= (entry.traceSequence ?? 0)) continue
      if (trace.phase === "window.error" || trace.phase === "window.unhandledrejection" || trace.phase === "service.error" || trace.phase === "service.unhandledrejection") event(trace.phase, entry, trace.message ? {message: trace.message} : {})
      entry.traceSequence = trace.sequence
    }
  }
  const failure = (requestId: string, selected: ClientTarget | null, code: ClientFailureCode, message: string): ClientCommandReceipt =>
    ({schema: "cosmos/client-command/v1", version: 1, requestId, target: selected, ok: false, error: {code, message}})
  const remove = (entry: Entry) => {
    if (entries.get(entry.socket.data.connectionId) !== entry) return
    entries.delete(entry.socket.data.connectionId)
    clearTimeout(entry.expires)
    if (entry.descriptor) event("disconnected", entry)
    for (const [id, work] of pending) if (work.entry === entry) work.finish(failure(id, target(entry), "disconnected", "Pinned client disconnected; action outcome may be unknown; do not resend automatically"))
  }
  const expire = (entry: Entry) => {
    clearTimeout(entry.expires)
    entry.expires = setTimeout(() => {remove(entry); entry.socket.close(1001, "Client heartbeat expired")}, entry.descriptor ? options.heartbeatMs ?? 30_000 : 5000)
    entry.expires.unref?.()
  }
  const pick = (selector: ClientSelector = "last-active") => selector === "last-active" ? lastActive()
    : [...entries.values()].find(entry => entry.descriptor?.id === selector.clientId && entry.socket.data.connectionId === selector.connectionId)
  const validRequest = (input: unknown, operation: ClientOperation) => {
    if (!clientRecord(input, operation === "act" ? ["action"] : [], operation === "logs" ? ["target", "afterSequence", "limit", "source", "producerId"] : operation === "cache" ? ["target", "afterIndex", "limit", "hash"] : operation === "diagnostics" ? ["target", "afterIndex", "limit", "sampleMs"] : ["target"]) ||
        input.target !== undefined && !isClientSelector(input.target) || operation === "act" && !isClientAction(input.action) ||
        input.afterSequence !== undefined && !(typeof input.afterSequence === "number" && Number.isSafeInteger(input.afterSequence) && input.afterSequence >= 0) ||
        input.source !== undefined && input.source !== "window" && input.source !== "service" || input.producerId !== undefined && typeof input.producerId !== "string" || input.afterIndex !== undefined && !(typeof input.afterIndex === "number" && Number.isSafeInteger(input.afterIndex) && input.afterIndex >= 0) || input.hash !== undefined && typeof input.hash !== "boolean" ||
        input.sampleMs !== undefined && !(typeof input.sampleMs === "number" && Number.isSafeInteger(input.sampleMs) && (input.sampleMs === 0 || input.sampleMs >= 1000 && input.sampleMs <= 3000)) ||
        input.limit !== undefined && !(typeof input.limit === "number" && Number.isSafeInteger(input.limit) && input.limit > 0 && input.limit <= 128)) throw new Error("Invalid closed client Oracle request")
    return input
  }
  const command = async (operation: ClientOperation, input: unknown): Promise<ClientCommandReceipt> => {
    ready()
    const request = validRequest(input, operation)
    const id = `request:${instance}:${++requestSequence}`
    const entry = pick(request.target as ClientSelector | undefined)
    if (!entry?.descriptor) return failure(id, null, "no_active_client", "No matching human-active connected Window")
    const selected = target(entry)
    const capability = operation === "act" ? (request.action as ClientViewAction).type : operation
    if (!entry.descriptor.capabilities.includes(capability)) return failure(id, selected, "unsupported", "Pinned client does not advertise this capability")
    if (pending.size >= 64 || [...pending.values()].filter(work => work.entry === entry).length >= 8) return failure(id, selected, "client_error", "Client command capacity exceeded")
    return await new Promise<ClientCommandReceipt>(resolve => {
      const finish = (receipt: ClientCommandReceipt) => {const current = pending.get(id); if (!current) return; pending.delete(id); clearTimeout(current.timer); resolve(receipt)}
      const timer = setTimeout(() => {
        finish(failure(id, selected, "timeout", "Client command timed out; outcome is unknown; do not resend automatically"))
        try {entry.socket.send(JSON.stringify({type: "cancel", connectionId: selected.connectionId, requestId: id, reason: "timeout"} satisfies ClientOutbound))} catch {}
      }, options.timeoutMs ?? 10_000)
      pending.set(id, {entry, operation, finish, timer})
      const message: ClientOutbound = operation === "act" ? {type: "command", connectionId: selected.connectionId, requestId: id, deadline: Date.now() + (options.timeoutMs ?? 10_000), operation, action: request.action as ClientViewAction}
        : {type: "command", connectionId: selected.connectionId, requestId: id, deadline: Date.now() + (options.timeoutMs ?? 10_000), operation,
          ...(typeof request.sampleMs === "number" ? {sampleMs: request.sampleMs} : {}), ...(typeof request.afterSequence === "number" ? {afterSequence: request.afterSequence} : {}), ...(request.source === "window" || request.source === "service" ? {source: request.source} : {}), ...(typeof request.producerId === "string" ? {producerId: request.producerId} : {}), ...(typeof request.afterIndex === "number" ? {afterIndex: request.afterIndex} : {}), ...(typeof request.hash === "boolean" ? {hash: request.hash} : {}), ...(typeof request.limit === "number" ? {limit: request.limit} : {})}
      void readWorld().then(world => {
        if (!pending.has(id)) return
        ready()
        if (entries.get(selected.connectionId) !== entry || !sameWorld(world, entry.world)) {finish(failure(id, selected, "disconnected", "Pinned client/world incarnation changed")); return}
        try {entry.socket.send(JSON.stringify(message))} catch {remove(entry)}
      }).catch(() => finish(failure(id, selected, "disconnected", "Pinned client world is unavailable")))
    })
  }
  return {
    owns(data: unknown): data is ClientSocketData {return clientRecord(data, ["kind", "connectionId"]) && data.kind === "cosmos-client" && typeof data.connectionId === "string"},
    async fetch(request: Request, host: Host): Promise<Response | undefined> {
      if (new URL(request.url).pathname !== CLIENT_SOCKET_PATH) return new Response(null, {status: 404})
      try {authorizeAgentRequest(request, host)} catch {return new Response(null, {status: 403})}
      if (request.method !== "GET" || request.headers.get("origin") !== new URL(request.url).origin || new URL(request.url).search) return new Response(null, {status: 400})
      try {
        ready()
        if (entries.size >= 32) return new Response(null, {status: 429})
        const world = await readWorld()
        ready()
        const connectionId = `connection:${instance}:${++connectionSequence}`
        // Reserve before upgrade, including adapters that invoke open synchronously.
        const entry: Entry = {world, socket: {data: {kind: "cosmos-client", connectionId}, send() {return 0}, close() {}}, expires: setTimeout(() => {}, 0)}
        clearTimeout(entry.expires)
        entries.set(connectionId, entry)
        expire(entry)
        try {if (!host.upgrade(request, {data: {kind: "cosmos-client", connectionId}})) {remove(entry); return new Response(null, {status: 426})}}
        catch (error) {remove(entry); throw error}
        return
      } catch {return new Response(null, {status: 503})}
    },
    websocket: {
      open(socket: Socket) {const entry = entries.get(socket.data.connectionId); if (!entry || closed) {socket.close(1012, "Client incarnation unavailable"); return}; entry.socket = socket},
      message(socket: Socket, raw: string | Buffer) {
        const entry = entries.get(socket.data.connectionId)
        if (!entry || entry.socket !== socket || closed) {socket.close(1008, "Unknown client incarnation"); return}
        let input: ReturnType<typeof parseClientInbound> = null
        try {if (Buffer.byteLength(raw) <= CLIENT_WIRE_MAX_BYTES) input = parseClientInbound(JSON.parse(raw.toString()))} catch {}
        if (!input) {remove(entry); socket.close(1008, "Invalid bounded client frame"); return}
        if (input.type === "hello") {
          if (entry.descriptor || [...entries.values()].some(other => other !== entry && other.descriptor?.id === input.clientId)) {remove(entry); socket.close(1008, "Client already registered"); return}
          entry.descriptor = {id: input.clientId ?? `window:${instance}:${++clientSequence}`, connectionId: socket.data.connectionId, kind: "Window", world: entry.world,
            capabilities: input.capabilities, status: input.status, lastActivitySequence: null, lastSeenAt: Date.now()}
          event("registered", entry); observeStatus(entry, input.status); expire(entry)
          socket.send(JSON.stringify({type: "registered", version: 1, client: entry.descriptor} satisfies ClientOutbound))
          return
        }
        if (!entry.descriptor || input.connectionId !== socket.data.connectionId) {remove(entry); socket.close(1008, "Client incarnation mismatch"); return}
        if (input.type === "feedback") {
          const feedback = input.feedback, selected = target(entry)
          if (!sameWorld(feedback.world, entry.world) || feedback.request.correlation.clientId !== selected.clientId) {socket.close(1008, "Feedback pinned client/world mismatch"); return}
          if (!options.feedback) {socket.send(JSON.stringify({type: "feedback-receipt", connectionId: selected.connectionId, id: feedback.request.id, ok: false, error: {code: "unsupported", message: "Feedback owner is unavailable"}} satisfies ClientOutbound)); return}
          void Promise.resolve().then(() => {ready(); return options.feedback!(structuredClone(feedback))}).then(receipt => {
            if (!receipt.replayed) event("feedback.accepted", entry, {feedbackId: receipt.id})
            if (entries.get(selected.connectionId) === entry) {try {socket.send(JSON.stringify({type: "feedback-receipt", connectionId: selected.connectionId, id: receipt.id, ok: true, receipt} satisfies ClientOutbound))} catch {}}
          }).catch(error => {
            const message = error instanceof Error ? error.message.slice(0, 512) : "Feedback was not confirmed"
            event("feedback.failed", entry, {feedbackId: feedback.request.id, message})
            if (entries.get(selected.connectionId) === entry) {try {socket.send(JSON.stringify({type: "feedback-receipt", connectionId: selected.connectionId, id: feedback.request.id, ok: false,
              error: {code: error && typeof error === "object" && error.code === "conflict" ? "conflict" : "client_error", message}} satisfies ClientOutbound))} catch {}}
          })
          return
        }
        if (input.type === "heartbeat" || input.type === "activity") {
          const previousPhase = entry.descriptor.status.boot.phase
          entry.descriptor.status = input.status; observeStatus(entry, input.status, previousPhase); entry.descriptor.lastSeenAt = Date.now(); expire(entry)
          if (input.type === "activity" && input.status.visible && ((input.event !== "focus" && input.event !== "observed-focus") || input.status.focused)) {
            event("activity", entry); entry.descriptor.lastActivitySequence = eventSequence
          }
          return
        }
        const work = pending.get(input.requestId)
        if (!work || work.entry !== entry) return
        if (input.type === "capture-start" || input.type === "capture-chunk" || input.type === "capture-end") {
          const reject = () => work.finish(failure(input.requestId, target(entry), "invalid_reply", "Invalid pinned capture sequence"))
          if (work.operation !== "capture") {reject(); return}
          if (input.type === "capture-start") {
            if (work.capture) {reject(); return}
            work.capture = {metadata: input.metadata, characters: input.characters, received: 0, chunks: []}
          } else if (input.type === "capture-chunk") {
            const capture = work.capture
            if (!capture || input.offset !== capture.received || capture.received + input.data.length > capture.characters) {reject(); return}
            capture.chunks.push(input.data)
            capture.received += input.data.length
          } else {
            const capture = work.capture
            if (!capture || capture.received !== capture.characters) {reject(); return}
            const value = {...capture.metadata, pngBase64: capture.chunks.join("")}
            if (!isClientResult("capture", value)) {reject(); return}
            work.finish({schema: "cosmos/client-command/v1", version: 1, requestId: input.requestId, target: target(entry), ok: true, value})
          }
          return
        }
        if (input.ok && !isClientResult(work.operation, input.value)) {work.finish(failure(input.requestId, target(entry), "invalid_reply", "Client returned an invalid bounded observation")); return}
        work.finish(input.ok ? {schema: "cosmos/client-command/v1", version: 1, requestId: input.requestId, target: target(entry), ok: true, value: input.value}
          : {schema: "cosmos/client-command/v1", version: 1, requestId: input.requestId, target: target(entry), ok: false, error: input.error})
      },
      close(socket: Socket) {const entry = entries.get(socket.data.connectionId); if (entry?.socket === socket) remove(entry)},
    },
    async read(input: unknown): Promise<ClientsReceipt> {ready(); if (!clientRecord(input, [])) throw new Error("Client read requires empty arguments"); const world = await readWorld(); ready(); for (const entry of [...entries.values()]) if (!sameWorld(entry.world, world)) {remove(entry); entry.socket.close(1008, "Client world changed")}; const active = lastActive(); return {schema: "cosmos/clients/v1", version: 1, world, sequence: eventSequence, lastActive: active ? target(active) : null, clients: structuredClone([...entries.values()].flatMap(entry => entry.descriptor ? [entry.descriptor] : []))}},
    inspect: (input: unknown) => command("inspect", input),
    act: (input: unknown) => command("act", input),
    logs: (input: unknown) => command("logs", input),
    cache: (input: unknown) => command("cache", input),
    diagnostics: (input: unknown) => command("diagnostics", input),
    capture: (input: unknown) => command("capture", input),
    events(input: unknown): ClientEvents {
      ready()
      if (!clientRecord(input, [], ["afterSequence", "limit"]) ||
          input.afterSequence !== undefined && !(typeof input.afterSequence === "number" && Number.isSafeInteger(input.afterSequence) && input.afterSequence >= 0) ||
          input.limit !== undefined && !(typeof input.limit === "number" && Number.isSafeInteger(input.limit) && input.limit > 0 && input.limit <= 128)) throw new Error("Invalid client events request")
      const after = typeof input.afterSequence === "number" ? input.afterSequence : 0
      const selected = events.filter(item => item.sequence > after).slice(0, typeof input.limit === "number" ? input.limit : 64)
      return {schema: "cosmos/client-events/v1", version: 1, entries: structuredClone(selected),
        cursor: selected.at(-1)?.sequence ?? Math.min(after, eventSequence), dropped: Math.max(0, eventSequence - events.length)}
    },
    close() {if (closed) return; closed = true; for (const entry of [...entries.values()]) {remove(entry); entry.socket.close(1012, "Release client registry closed")}},
  }
}

/** Подключает действующие client methods к существующему Oracle router до запуска Quantum. */
export function createClientOracle(options: {admitted?: () => boolean, world?: () => Promise<ClientWorld>, timeoutMs?: number, heartbeatMs?: number} = {}) {
  let peer: OracleRpcPeer
  const local = createLocalOracleChannelPair("cosmos-clients", () => peer.methods())
  peer = new OracleRpcPeer(local.peer)
  const feedbackLifetime = new AbortController()
  const feedback = createClientFeedbackBridge({peer, admitted: () => options.admitted?.() !== false, signal: feedbackLifetime.signal})
  const registry = createClientRegistry({feedback, ...(options.timeoutMs === undefined ? {} : {timeoutMs: options.timeoutMs}), ...(options.heartbeatMs === undefined ? {} : {heartbeatMs: options.heartbeatMs}), ...(options.admitted ? {admitted: options.admitted} : {}), world: options.world ?? (async () => {
    const [graph, history] = await Promise.all([peer.call<{root: string}>("dark", READ_GRAPH_METHOD, {}), peer.call<DarkForceHistoryReadReceipt>("dark", DARK_FORCE_HISTORY_READ_METHOD, {contractVersion: 1, query: {kind: "frontier"}})])
    if (!graph.root || !history.frontier.cutId) throw new Error("Client world binding unavailable")
    return {root: graph.root, cutId: history.frontier.cutId}
  })})
  peer.expose(CLIENTS_READ_METHOD, input => registry.read(input))
  peer.expose(CLIENT_INSPECT_METHOD, input => registry.inspect(input))
  peer.expose(CLIENT_ACT_METHOD, input => registry.act(input))
  peer.expose(CLIENT_LOGS_METHOD, input => registry.logs(input))
  peer.expose(CLIENT_CACHE_METHOD, input => registry.cache(input))
  peer.expose(CLIENT_DIAGNOSTICS_METHOD, input => registry.diagnostics(input))
  peer.expose(CLIENT_CAPTURE_METHOD, input => registry.capture(input))
  peer.expose(CLIENT_EVENTS_METHOD, input => registry.events(input))
  let closing: Promise<void> | undefined
  return {...registry, channel: local.router, close() {return closing ??= (async () => {feedbackLifetime.abort(new Error("Release feedback owner closed")); registry.close(); peer.close(); await local.peer.close(); await local.router.close()})()}}
}
