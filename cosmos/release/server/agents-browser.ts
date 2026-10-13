import type {BrowserPeerClient, BrowserPeerSocket, BrowserPeerScreenshotSocket} from "@zavx0z/provider-tech-peer/browser-types"
import type {ProviderBinding} from "@metafor/types/metafor/providers"
import {READ_GRAPH_METHOD, type Graph} from "@metafor/types/metafor/graph"
import type {OracleRpcPeer} from "shared/transport/oracle"
import {authorizedProviderBrowserClient} from "@metafor/provider/driver"
import {readAgentProvider, readProviderRegistry, browserBinding} from "./agent-provider"
import {authorizeAgentRequest, readAgentBody} from "./agents"
import {AGENT_BROWSER_PATH, AGENT_BROWSER_SCHEMA, AGENT_BROWSER_RENEW_SCHEMA, type AgentBrowserBootstrap, type AgentBrowserRenewal} from "../shared/agents-browser"

export type AgentBrowserSocketData = {kind: "agent-browser", ticket: string, instanceId: string, viewerPeerId: string}
  | {kind: "agent-browser-screenshot", ticket: string, instanceId: string, profile: string}
type BrowserHost = {requestIP(request: Request): {address: string} | null, upgrade(request: Request, options: {data: AgentBrowserSocketData}): boolean}
type NativeLease = {client: BrowserPeerClient, close(): Promise<void>}
type Lease = {ticket: string, agentRef: string | null, providerRef: string, entryId: string, binding: ProviderBinding,
  controller: AbortController, native: NativeLease, expiresAt: number, timer?: ReturnType<typeof setTimeout>,
  socket?: Bun.ServerWebSocket<AgentBrowserSocketData>, signaling?: BrowserPeerSocket, queued: string[], queuedBytes: number, closing?: Promise<void>,
  screenshotSocket?: Bun.ServerWebSocket<AgentBrowserSocketData>, screenshot?: BrowserPeerScreenshotSocket, screenshotQueued?: Array<string | Uint8Array>, screenshotBytes?: number}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)
const same = (a: ProviderBinding, b: ProviderBinding) => ["id", "service", "host", "remotePeerId", "executorId", "assignmentId"].every(key => a[key as keyof ProviderBinding] === b[key as keyof ProviderBinding])
const bytes = (value: string) => Buffer.byteLength(value)
const failure = (status = 409) => Response.json({error: {code: "browser_unavailable", message: "Assigned browser preview is unavailable or its binding changed"}}, {status, headers: {"cache-control": "no-store"}})

/**
Same-origin lifecycle ссылки назначенного канонического Provider существующего Agent.
Adapter передаёт bounded signaling strings и screenshot-provider frames; native
credentials, HTTP screen/control и model prompts остаются у своих владельцев.
Screenshot socket сохраняет точные profile/instance и Capsule request correlation;
его закрытие сохраняет RTC viewer. Каждый describe/connect повторно наблюдает
Graph и registry Mass. Продление повторно проверяет тот же Mass binding и
переносит единственный expiry timer, сохраняя native lease и RTC. Истечение
ticket, teardown и потеря scope закрывают grant.
Проверки используют public protocol fixtures, без запуска браузера.
*/
export function createAgentBrowserBridge(options: {peer: Pick<OracleRpcPeer, "call">, admitted?: () => boolean,
  native?: (binding: ProviderBinding, signal: AbortSignal) => Promise<NativeLease>, iceServers?: AgentBrowserBootstrap["iceServers"], lifetimeMs?: number}) {
  const leases = new Map<string, Lease>()
  const pending = new Set<AbortController>()
  let closed = false
  const ready = () => {if (closed || options.admitted?.() === false) throw new Error("World is unavailable")}
  const closeScreenshot = (lease: Lease) => {
    const socket = lease.screenshotSocket, native = lease.screenshot
    delete lease.screenshotSocket; delete lease.screenshot; delete lease.screenshotQueued; delete lease.screenshotBytes
    socket?.close(1000, "Screenshot provider closed")
    native?.close()
  }
  const close = (lease: Lease): Promise<void> => lease.closing ??= (async () => {
    leases.delete(lease.ticket)
    clearTimeout(lease.timer)
    lease.controller.abort()
    lease.socket?.close(1000, "Viewer lease closed")
    lease.signaling?.close()
    closeScreenshot(lease)
    await lease.native.close()
  })()
  const extend = (lease: Lease) => {
    clearTimeout(lease.timer)
    lease.expiresAt = Date.now() + (options.lifetimeMs ?? 15 * 60_000)
    lease.timer = setTimeout(() => {void close(lease).catch(() => {})}, Math.max(1, lease.expiresAt - Date.now()))
    lease.timer.unref?.()
  }
  const binding = async (agentRef: string | null, providerRef: string, entryId: string) => {
    ready()
    const graph = await options.peer.call<Graph>("dark", READ_GRAPH_METHOD, {})
    const provider = agentRef === null ? await readProviderRegistry(options.peer, graph, providerRef) : await readAgentProvider(options.peer, graph, agentRef, providerRef)
    ready()
    return browserBinding(provider.registry, entryId)
  }
  const validate = async (lease: Lease) => {
    if (!leases.has(lease.ticket) || lease.expiresAt <= Date.now() || !same(lease.binding, await binding(lease.agentRef, lease.providerRef, lease.entryId))) throw new Error("Viewer binding changed")
    lease.controller.signal.throwIfAborted()
  }
  const describe = async (lease: Lease) => {
    try {
      await validate(lease)
      const value = await lease.native.client.describe({peerId: lease.binding.remotePeerId, executorId: lease.binding.executorId, signal: lease.controller.signal})
      await validate(lease)
      return value
    } catch (error) {await close(lease); throw error}
  }
  const monitor = setInterval(() => {for (const lease of leases.values()) void validate(lease).catch(() => close(lease)).catch(() => {})}, 3000)
  monitor.unref?.()
  const requireLease = (value: unknown) => {
    if (!exact(value, ["ticket"]) || !id(value.ticket)) throw new Error("Invalid viewer ticket")
    const lease = leases.get(value.ticket)
    if (!lease) throw new Error("Viewer ticket expired")
    return lease
  }
  return {
    owns(data: unknown): data is AgentBrowserSocketData {return object(data) && (data.kind === "agent-browser" || data.kind === "agent-browser-screenshot")},
    async fetch(request: Request, host: BrowserHost): Promise<Response | undefined> {
      const url = new URL(request.url)
      if (!url.pathname.startsWith(AGENT_BROWSER_PATH + "/")) return new Response(null, {status: 404})
      try {
        authorizeAgentRequest(request, host)
        if (url.pathname !== `${AGENT_BROWSER_PATH}/renew`) ready()
        if (url.pathname === `${AGENT_BROWSER_PATH}/screenshot`) {
          if (request.method !== "GET" || request.headers.get("origin") !== url.origin ||
            [...url.searchParams.keys()].sort().join(",") !== "instanceId,profile,ticket") return failure(400)
          const {ticket, instanceId, profile} = Object.fromEntries(url.searchParams)
          if (!id(ticket) || !id(instanceId) || !profile || profile.length > 128 || /[\u0000-\u001f\u007f]/u.test(profile)) return failure(400)
          const lease = requireLease({ticket}), current = await describe(lease)
          if (lease.screenshotSocket || lease.screenshot || !lease.native.client.screenshotProvider || current.instanceId !== instanceId || current.profile !== profile) return failure()
          return host.upgrade(request, {data: {kind: "agent-browser-screenshot", ticket, instanceId, profile}}) ? undefined : failure(426)
        }
        if (url.pathname === `${AGENT_BROWSER_PATH}/socket`) {
          if (request.method !== "GET" || request.headers.get("origin") !== url.origin ||
            !["instanceId,ticket,viewerPeerId", "instanceId,peer,ticket"].includes([...url.searchParams.keys()].sort().join(","))) return failure(400)
          const {ticket, instanceId} = Object.fromEntries(url.searchParams)
          const viewerPeerId = url.searchParams.get("viewerPeerId") ?? url.searchParams.get("peer")
          if (!id(ticket) || !id(instanceId) || !id(viewerPeerId)) return failure(400)
          const lease = requireLease({ticket})
          if (lease.socket || lease.signaling || (await describe(lease)).instanceId !== instanceId) return failure()
          return host.upgrade(request, {data: {kind: "agent-browser", ticket, instanceId, viewerPeerId}}) ? undefined : failure(426)
        }
        if (url.search) return failure(400)
        const value = await readAgentBody(request)
        if (url.pathname === `${AGENT_BROWSER_PATH}/bootstrap` && request.method === "POST") {
          if (!exact(value, ["agentRef", "providerRef", "entryId"]) || value.agentRef !== null && (!id(value.agentRef) || !value.agentRef.startsWith("atom:")) ||
            !id(value.providerRef) || !value.providerRef.startsWith("atom:") || !id(value.entryId) || leases.size + pending.size >= 16) return failure(400)
          const controller = new AbortController()
          pending.add(controller)
          const abort = () => controller.abort(request.signal.reason)
          request.signal.addEventListener("abort", abort, {once: true})
          let native: NativeLease | undefined
          let lease: Lease | undefined
          try {
            const selected = await binding(value.agentRef, value.providerRef, value.entryId)
            const opened = await (options.native ?? authorizedProviderBrowserClient)(selected, AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]))
            native = opened
            controller.signal.throwIfAborted()
            const ticket = crypto.randomUUID(), expiresAt = Date.now() + (options.lifetimeMs ?? 15 * 60_000)
            const acquired: Lease = {ticket, agentRef: value.agentRef, providerRef: value.providerRef, entryId: value.entryId, binding: selected, controller, native: opened, expiresAt, queued: [], queuedBytes: 0}
            lease = acquired
            leases.set(ticket, acquired)
            extend(acquired)
            const description = await describe(acquired)
            return Response.json({schema: AGENT_BROWSER_SCHEMA, version: 1, ticket, expiresAt: acquired.expiresAt, binding: selected, description,
              screenshotProvider: typeof acquired.native.client.screenshotProvider === "function",
              iceServers: structuredClone(options.iceServers ?? [{urls: "stun:stun.l.google.com:19302"}])} satisfies AgentBrowserBootstrap, {headers: {"cache-control": "no-store"}})
          } catch (error) {if (lease) await close(lease); else await native?.close(); throw error}
          finally {pending.delete(controller); request.signal.removeEventListener("abort", abort)}
        }
        const lease = requireLease(value)
        if (url.pathname === `${AGENT_BROWSER_PATH}/renew` && request.method === "POST") {
          try {
            ready()
            await validate(lease)
            request.signal.throwIfAborted()
            extend(lease)
            return Response.json({schema: AGENT_BROWSER_RENEW_SCHEMA, version: 1, ticket: lease.ticket, expiresAt: lease.expiresAt} satisfies AgentBrowserRenewal, {headers: {"cache-control": "no-store"}})
          } catch (error) {await close(lease); throw error}
        }
        if (url.pathname === `${AGENT_BROWSER_PATH}/bootstrap` && request.method === "DELETE") {await close(lease); return new Response(null, {status: 204})}
        if (url.pathname === `${AGENT_BROWSER_PATH}/describe` && request.method === "POST") return Response.json(await describe(lease), {headers: {"cache-control": "no-store"}})
        return failure(405)
      } catch {return failure()}
    },
    websocket: {
      open(socket: Bun.ServerWebSocket<AgentBrowserSocketData>) {
        const lease = leases.get(socket.data.ticket)
        if (socket.data.kind === "agent-browser-screenshot") {
          if (!lease || lease.screenshotSocket || !lease.native.client.screenshotProvider) {socket.close(1008, "Screenshot lease unavailable"); return}
          const selected = socket.data
          lease.screenshotSocket = socket
          lease.screenshotQueued = []
          lease.screenshotBytes = 0
          void (async () => {
            const current = await describe(lease)
            if (current.instanceId !== selected.instanceId || current.profile !== selected.profile || lease.screenshotSocket !== socket) throw new Error("Screenshot profile changed")
            const native = lease.native.client.screenshotProvider!({peerId: lease.binding.remotePeerId, executorId: lease.binding.executorId,
              instanceId: selected.instanceId, profile: selected.profile, signal: lease.controller.signal})
            lease.screenshot = native
            native.addEventListener("open", () => {
              if (lease.screenshot !== native) return
              try {for (const value of lease.screenshotQueued ?? []) native.send(value); lease.screenshotQueued = []; lease.screenshotBytes = 0}
              catch {closeScreenshot(lease)}
            })
            native.addEventListener("message", event => {
              if (lease.screenshot !== native) return
              const size = typeof event.data === "string" ? bytes(event.data) : event.data.byteLength
              if (size > (typeof event.data === "string" ? 64 * 1024 : 8 * 1024 * 1024) || socket.getBufferedAmount() + size > 9 * 1024 * 1024) {closeScreenshot(lease); return}
              socket.send(event.data)
            })
            native.addEventListener("close", () => {if (lease.screenshot === native) closeScreenshot(lease)})
            native.addEventListener("error", () => {if (lease.screenshot === native) closeScreenshot(lease)})
          })().catch(() => closeScreenshot(lease))
          return
        }
        if (!lease || lease.socket) {socket.close(1008, "Viewer lease unavailable"); return}
        const selected = socket.data
        lease.socket = socket
        void (async () => {
          if ((await describe(lease)).instanceId !== selected.instanceId) throw new Error("Browser instance changed")
          const native = lease.native.client.socket({peerId: lease.binding.remotePeerId, executorId: lease.binding.executorId,
            instanceId: selected.instanceId, viewerPeerId: selected.viewerPeerId, signal: lease.controller.signal})
          lease.signaling = native
          native.addEventListener("open", () => {
            try {for (const value of lease.queued) native.send(value); lease.queued = []; lease.queuedBytes = 0}
            catch {void close(lease).catch(() => {})}
          })
          native.addEventListener("message", event => {
            if (bytes(event.data) > 64 * 1024 || socket.getBufferedAmount() + bytes(event.data) > 256 * 1024) {void close(lease).catch(() => {}); return}
            socket.send(event.data)
          })
          native.addEventListener("close", () => {void close(lease).catch(() => {})})
          native.addEventListener("error", () => {void close(lease).catch(() => {})})
        })().catch(() => close(lease)).catch(() => {})
      },
      message(socket: Bun.ServerWebSocket<AgentBrowserSocketData>, value: string | Buffer) {
        const lease = leases.get(socket.data.ticket)
        if (socket.data.kind === "agent-browser-screenshot") {
          const size = typeof value === "string" ? bytes(value) : value.byteLength
          if (!lease || lease.screenshotSocket !== socket) {socket.close(1008, "Screenshot lease unavailable"); return}
          if (size > (typeof value === "string" ? 64 * 1024 : 8 * 1024 * 1024) || (lease.screenshotBytes ?? 0) + (lease.screenshot?.bufferedAmount ?? 0) + size > 9 * 1024 * 1024) {closeScreenshot(lease); return}
          if (!lease.screenshot || lease.screenshot.readyState === 0) {
            lease.screenshotQueued ??= []; lease.screenshotQueued.push(typeof value === "string" ? value : Uint8Array.from(value)); lease.screenshotBytes = (lease.screenshotBytes ?? 0) + size; return
          }
          try {lease.screenshot.send(value)} catch {closeScreenshot(lease)}
          return
        }
        if (!lease || typeof value !== "string" || bytes(value) > 64 * 1024 || lease.queuedBytes + (lease.signaling?.bufferedAmount ?? 0) + bytes(value) > 256 * 1024) {
          socket.close(1008, "Invalid viewer signaling"); if (lease) void close(lease).catch(() => {}); return
        }
        if (!lease.signaling || lease.signaling.readyState === 0) {lease.queued.push(value); lease.queuedBytes += bytes(value); return}
        try {lease.signaling.send(value)} catch {void close(lease).catch(() => {})}
      },
      close(socket: Bun.ServerWebSocket<AgentBrowserSocketData>) {
        const lease = leases.get(socket.data.ticket)
        if (lease && socket.data.kind === "agent-browser-screenshot") {if (lease.screenshotSocket === socket) closeScreenshot(lease); return}
        if (lease) void close(lease).catch(() => {})
      },
    },
    async close() {closed = true; clearInterval(monitor); for (const controller of pending) controller.abort(); await Promise.allSettled([...leases.values()].map(close))},
  }
}
