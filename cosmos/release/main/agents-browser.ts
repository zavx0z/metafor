import type {AtomBrowserConnection} from "@metafor/agent/atom"
import type {BrowserPeerClient, BrowserPeerDescription, BrowserPeerSelection, BrowserPeerSocket, BrowserPeerEvents, BrowserPeerScreenshotSocket} from "@zavx0z/provider-tech-peer/browser-types"
import type {ProviderBinding} from "@metafor/types/metafor/providers"
import {AGENT_BROWSER_SCHEMA, type AgentBrowserBootstrap} from "../shared/agents-browser"

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const same = (a: ProviderBinding, b: ProviderBinding) => ["id", "service", "host", "remotePeerId", "executorId", "assignmentId"].every(key => a[key as keyof ProviderBinding] === b[key as keyof ProviderBinding])
function description(value: unknown): BrowserPeerDescription {
  if (!object(value) || Object.keys(value).some(key => !["instanceId", "profile", "controlEnabled", "media", "target"].includes(key)) ||
    typeof value.instanceId !== "string" || !value.instanceId || typeof value.profile !== "string" || !value.profile || typeof value.controlEnabled !== "boolean") throw new Error("Недоступна identity браузера")
  const media = value.media
  if (media !== undefined && (!object(media) || Object.keys(media).length !== 2 || typeof media.audio !== "boolean" ||
    ![null, "data-channel", "rtp"].includes(media.microphoneTransport as string | null))) throw new Error("Недоступны возможности медиа")
  const target = value.target
  if (target !== undefined && target !== null) {
    if (!object(target) || Object.keys(target).sort().join(",") !== "id,origin,ready" || typeof target.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(target.id)
      || typeof target.origin !== "string" || typeof target.ready !== "boolean") throw new Error("Недоступна identity захваченной вкладки")
    const origin = new URL(target.origin)
    if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== target.origin || origin.username || origin.password) throw new Error("Недоступен origin захваченной вкладки")
  }
  return value as BrowserPeerDescription
}

/** Exclusive same-origin viewer facade. Native credentials never enter Window; close revokes only its lifecycle ticket. */
export async function connectAgentBrowser(input: {agentRef: string | null, providerRef: string, binding: ProviderBinding, url: string,
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, signal: AbortSignal, socket?: (url: string) => WebSocket}): Promise<AtomBrowserConnection> {
  input.signal.throwIfAborted()
  const url = new URL(input.url.replace(/\/$/, "") + "/browser", globalThis.location?.href ?? "http://localhost")
  const request = async (path: string, body: unknown, signal?: AbortSignal, method = "POST"): Promise<unknown> => {
    const response = await input.fetch(`${url.href}/${path}`, {method, headers: {"content-type": "application/json"}, body: JSON.stringify(body), ...(signal ? {signal} : {}), cache: "no-store", credentials: "same-origin"})
    if (!response.ok) throw new Error("Назначенный браузер недоступен или привязка изменилась")
    return response.status === 204 ? undefined : response.json()
  }
  const raw = await request("bootstrap", {agentRef: input.agentRef, providerRef: input.providerRef, entryId: input.binding.id}, input.signal)
  let bootstrap: AgentBrowserBootstrap
  let initial: BrowserPeerDescription
  try {
    if (!object(raw) || raw.schema !== AGENT_BROWSER_SCHEMA || raw.version !== 1 || typeof raw.ticket !== "string" || !/^[A-Za-z0-9-]{1,255}$/.test(raw.ticket) ||
      typeof raw.expiresAt !== "number" || raw.expiresAt <= Date.now() || !object(raw.binding) || !same(input.binding, raw.binding as unknown as ProviderBinding) || !Array.isArray(raw.iceServers) ||
      raw.screenshotProvider !== undefined && typeof raw.screenshotProvider !== "boolean") throw new Error("Среда вернула другую привязку браузера")
    bootstrap = raw as AgentBrowserBootstrap
    initial = description(bootstrap.description)
  } catch (error) {
    if (object(raw) && typeof raw.ticket === "string" && /^[A-Za-z0-9-]{1,255}$/.test(raw.ticket)) await request("bootstrap", {ticket: raw.ticket}, undefined, "DELETE").catch(() => {})
    throw error
  }
  const sockets = new Set<BrowserPeerSocket | BrowserPeerScreenshotSocket>()
  let closed = false
  const check = (selection: BrowserPeerSelection) => {
    if (closed || selection.peerId !== input.binding.remotePeerId || selection.executorId !== input.binding.executorId) throw new Error("Viewer selection вне назначенной привязки")
    input.signal.throwIfAborted()
    selection.signal?.throwIfAborted()
  }
  const client: BrowserPeerClient = {
    ...(bootstrap.screenshotProvider ? {screenshotProvider(selection: BrowserPeerSelection & {instanceId: string; profile: string}): BrowserPeerScreenshotSocket {
      check(selection)
      if (selection.instanceId !== initial.instanceId || selection.profile !== initial.profile) throw new Error("Screenshot selection вне назначенного profile")
      const endpoint = new URL(url.href + "/screenshot")
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:"
      endpoint.search = new URLSearchParams({ticket: bootstrap.ticket, instanceId: selection.instanceId, profile: selection.profile}).toString()
      const native = (input.socket ?? (url => new WebSocket(url)))(endpoint.href)
      native.binaryType = "arraybuffer"
      const listeners = new Map<string, Set<(event: never) => void>>()
      const emit = (type: string, event: unknown) => {for (const listener of listeners.get(type) ?? []) listener(event as never)}
      const socket: BrowserPeerScreenshotSocket = {get readyState() {return native.readyState}, get bufferedAmount() {return native.bufferedAmount},
        send(payload) {
          const bytes = typeof payload === "string" ? new TextEncoder().encode(payload).byteLength : payload.byteLength
          if (closed || bytes > (typeof payload === "string" ? 64 * 1024 : 8 * 1024 * 1024) || native.bufferedAmount + bytes > 9 * 1024 * 1024) throw new Error("Screenshot transport unavailable")
          native.send(typeof payload === "string" ? payload : Uint8Array.from(payload).buffer)
        }, close(code, reason) {native.close(code, reason)},
        addEventListener(type, listener) {let set = listeners.get(type); if (!set) {set = new Set(); listeners.set(type, set)}; set.add(listener as (event: never) => void)},
      }
      sockets.add(socket)
      const abort = () => native.close()
      selection.signal?.addEventListener("abort", abort, {once: true})
      native.addEventListener("open", () => emit("open", {type: "open"}))
      native.addEventListener("message", event => {
        const payload = typeof event.data === "string" ? event.data : event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : null
        if (payload === null || (typeof payload === "string" ? new TextEncoder().encode(payload).byteLength > 64 * 1024 : payload.byteLength > 8 * 1024 * 1024)) {native.close(1008, "Invalid screenshot frame"); return}
        emit("message", {type: "message", data: payload})
      })
      native.addEventListener("error", () => emit("error", {type: "error", message: "Screenshot transport unavailable"}))
      native.addEventListener("close", event => {sockets.delete(socket); selection.signal?.removeEventListener("abort", abort); emit("close", {type: "close", code: event.code, reason: event.reason})})
      return socket
    }} : {}),
    async describe(selection) {
      check(selection)
      const value = description(await request("describe", {ticket: bootstrap.ticket}, selection.signal ?? input.signal))
      check(selection)
      return value
    },
    socket(selection) {
      check(selection)
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(selection.instanceId) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(selection.viewerPeerId)) throw new Error("Invalid viewer identity")
      const endpoint = new URL(url.href + "/socket")
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:"
      endpoint.search = new URLSearchParams({ticket: bootstrap.ticket, instanceId: selection.instanceId, viewerPeerId: selection.viewerPeerId}).toString()
      const native = (input.socket ?? (url => new WebSocket(url)))(endpoint.href)
      const listeners = new Map<keyof BrowserPeerEvents, Set<(event: never) => void>>()
      const emit = <K extends keyof BrowserPeerEvents>(type: K, event: BrowserPeerEvents[K]) => {for (const listener of listeners.get(type) ?? []) listener(event as never)}
      const socket: BrowserPeerSocket = {get readyState() {return native.readyState}, get bufferedAmount() {return native.bufferedAmount},
        send(payload) {if (closed || typeof payload !== "string" || new TextEncoder().encode(payload).byteLength > 64 * 1024 || native.bufferedAmount > 256 * 1024) throw new Error("Viewer signaling unavailable"); native.send(payload)},
        close(code, reason) {native.close(code, reason)},
        addEventListener(type, listener) {let set = listeners.get(type); if (!set) {set = new Set(); listeners.set(type, set)}; set.add(listener as (event: never) => void)},
      }
      sockets.add(socket)
      const abort = () => {native.close()}
      selection.signal?.addEventListener("abort", abort, {once: true})
      native.addEventListener("open", () => emit("open", {type: "open"}))
      native.addEventListener("message", event => {if (typeof event.data !== "string") {native.close(1008, "Invalid signaling"); return}; emit("message", {type: "message", data: event.data})})
      native.addEventListener("error", () => emit("error", {type: "error", message: "Viewer signaling unavailable"}))
      native.addEventListener("close", event => {sockets.delete(socket); selection.signal?.removeEventListener("abort", abort); emit("close", {type: "close", code: event.code, reason: event.reason})})
      return socket
    },
    async close() {
      if (closed) return
      closed = true
      input.signal.removeEventListener("abort", abort)
      for (const socket of sockets) socket.close()
      sockets.clear()
      await request("bootstrap", {ticket: bootstrap.ticket}, undefined, "DELETE")
    },
  }
  const abort = () => {void client.close().catch(() => {})}
  input.signal.addEventListener("abort", abort, {once: true})
  if (input.signal.aborted) {await client.close(); input.signal.throwIfAborted()}
  return {client, binding: structuredClone(input.binding), iceServers: bootstrap.iceServers, ...(initial.media ? {media: initial.media} : {})}
}
