import type {ServerWebSocket} from "bun"
import type {Buffer} from "node:buffer"
import {randomUUID} from "node:crypto"

export type VoiceProxyRoute = "wake" | "asr"
export type VoiceProxyClientRoute = VoiceProxyRoute | "mux"

type VoiceProxyPayload = string | Buffer<ArrayBuffer> | ArrayBuffer | ArrayBufferView<ArrayBuffer>
type VoiceProxyUpstreamState = {
  route: VoiceProxyRoute
  targetUrl: string
  upstream: WebSocket | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  pending: VoiceProxyPayload[]
  pendingBytes: number
}

export type VoiceProxySocketData = {
  kind: "voice-proxy"
  id: string
  route: VoiceProxyClientRoute
  targetUrl: string
  connectedAt: number
  upstreams: Record<VoiceProxyRoute, VoiceProxyUpstreamState>
}

const MAX_PENDING_BYTES = 8 * 1024 * 1024
const RECONNECT_DELAY_MS = 700

export function voiceProxyTargetUrl(route: VoiceProxyRoute): string {
  if (route === "wake") return firstEnv("METAFOR_VOICE_WAKE_WS_URL", "VOICE_WAKE_WS_URL") ?? "ws://127.0.0.1:4765/ws"
  return firstEnv("METAFOR_VOICE_ASR_WS_URL", "VOICE_ASR_WS_URL") ?? "ws://127.0.0.1:8787/ws"
}

export function createVoiceProxySocketData(route: VoiceProxyClientRoute): VoiceProxySocketData {
  const upstreams = {
    wake: createVoiceProxyUpstreamState("wake"),
    asr: createVoiceProxyUpstreamState("asr"),
  } satisfies Record<VoiceProxyRoute, VoiceProxyUpstreamState>
  return {
    kind: "voice-proxy",
    id: randomUUID(),
    route,
    targetUrl: route === "mux" ? "voice-mux" : upstreams[route].targetUrl,
    connectedAt: Date.now(),
    upstreams,
  }
}

function createVoiceProxyUpstreamState(route: VoiceProxyRoute): VoiceProxyUpstreamState {
  return {route, targetUrl: voiceProxyTargetUrl(route), upstream: null, reconnectTimer: null, pending: [], pendingBytes: 0}
}

export function attachVoiceProxySocket(ws: ServerWebSocket<VoiceProxySocketData>): void {
  if (ws.data.route === "mux") {
    connectVoiceProxyUpstream(ws, "wake")
    connectVoiceProxyUpstream(ws, "asr")
    return
  }
  connectVoiceProxyUpstream(ws, ws.data.route)
}

function connectVoiceProxyUpstream(ws: ServerWebSocket<VoiceProxySocketData>, route: VoiceProxyRoute): void {
  if (ws.readyState !== WebSocket.OPEN) return
  const state = ws.data.upstreams[route]
  if (state.reconnectTimer !== null) {
    clearTimeout(state.reconnectTimer)
    state.reconnectTimer = null
  }
  if (state.upstream?.readyState === WebSocket.OPEN || state.upstream?.readyState === WebSocket.CONNECTING) return

  const upstream = new WebSocket(state.targetUrl)
  upstream.binaryType = "arraybuffer"
  state.upstream = upstream

  upstream.addEventListener("open", () => flushPendingVoiceProxyMessages(ws, state, upstream))
  upstream.addEventListener("message", (event) => {
    void sendVoiceProxyPayloadToClient(ws, route, event.data)
  })
  upstream.addEventListener("error", () => {
    if (state.upstream === upstream) scheduleVoiceProxyReconnect(ws, state, upstream)
  })
  upstream.addEventListener("close", () => {
    if (state.upstream !== upstream) return
    state.upstream = null
    scheduleVoiceProxyReconnect(ws, state)
  })
}

function scheduleVoiceProxyReconnect(ws: ServerWebSocket<VoiceProxySocketData>, state: VoiceProxyUpstreamState, upstream?: WebSocket): void {
  if (upstream !== undefined && state.upstream === upstream) {
    state.upstream = null
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close()
  }
  if (ws.readyState !== WebSocket.OPEN || state.reconnectTimer !== null) return
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null
    connectVoiceProxyUpstream(ws, state.route)
  }, RECONNECT_DELAY_MS)
}

export function relayVoiceProxyMessage(ws: ServerWebSocket<VoiceProxySocketData>, message: string | Buffer<ArrayBuffer>): void {
  const routed = voiceProxyPayloadRoute(ws.data.route, message)
  if (routed === null) {
    sendVoiceProxyStatus(ws, "error", "voice proxy mux message route missing")
    return
  }
  relayVoiceProxyPayload(ws, routed.route, routed.payload)
}

function voiceProxyPayloadRoute(clientRoute: VoiceProxyClientRoute, message: string | Buffer<ArrayBuffer>): {route: VoiceProxyRoute; payload: VoiceProxyPayload} | null {
  if (clientRoute !== "mux") return {route: clientRoute, payload: message}
  if (typeof message === "string") {
    try {
      const parsed = JSON.parse(message) as {route?: unknown; payload?: unknown}
      if ((parsed.route === "wake" || parsed.route === "asr") && typeof parsed.payload === "string") return {route: parsed.route, payload: parsed.payload}
    } catch {
      return null
    }
    return null
  }
  const bytes = new Uint8Array(message.buffer, message.byteOffset, message.byteLength)
  const route = bytes[0] === 1 ? "wake" : bytes[0] === 2 ? "asr" : null
  if (route === null) return null
  return {route, payload: bytes.slice(1)}
}

function relayVoiceProxyPayload(ws: ServerWebSocket<VoiceProxySocketData>, route: VoiceProxyRoute, message: VoiceProxyPayload): void {
  const state = ws.data.upstreams[route]
  if (state.upstream?.readyState === WebSocket.OPEN) {
    state.upstream.send(message)
    return
  }
  if (state.upstream?.readyState !== WebSocket.CONNECTING) scheduleVoiceProxyReconnect(ws, state)

  state.pending.push(message)
  state.pendingBytes += voiceProxyPayloadSize(message)
  if (state.pendingBytes > MAX_PENDING_BYTES) {
    state.pending = []
    state.pendingBytes = 0
    sendVoiceProxyStatus(ws, "error", `voice proxy ${route} pending buffer limit`)
  }
}

export function detachVoiceProxySocket(ws: ServerWebSocket<VoiceProxySocketData>): void {
  for (const state of Object.values(ws.data.upstreams)) {
    const upstream = state.upstream
    state.upstream = null
    if (state.reconnectTimer !== null) {
      clearTimeout(state.reconnectTimer)
      state.reconnectTimer = null
    }
    state.pending = []
    state.pendingBytes = 0
    if (upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) upstream.close()
  }
}

function flushPendingVoiceProxyMessages(ws: ServerWebSocket<VoiceProxySocketData>, state: VoiceProxyUpstreamState, upstream: WebSocket): void {
  const pending = state.pending
  state.pending = []
  state.pendingBytes = 0
  for (let index = 0; index < pending.length; index += 1) {
    const payload = pending[index]
    if (payload === undefined) continue
    if (upstream.readyState !== WebSocket.OPEN) {
      const unsent = pending.slice(index)
      state.pending = unsent
      state.pendingBytes = unsent.reduce((size, item) => size + voiceProxyPayloadSize(item), 0)
      scheduleVoiceProxyReconnect(ws, state, upstream)
      return
    }
    upstream.send(payload)
  }
}

async function sendVoiceProxyPayloadToClient(ws: ServerWebSocket<VoiceProxySocketData>, route: VoiceProxyRoute, payload: unknown): Promise<void> {
  if (ws.readyState !== WebSocket.OPEN) return
  if (ws.data.route !== "mux") {
    await sendVoiceProxyRawPayloadToClient(ws, payload)
    return
  }
  if (typeof payload === "string") {
    ws.send(JSON.stringify({route, payload}))
    return
  }
  const bytes = payload instanceof Blob
    ? new Uint8Array(await payload.arrayBuffer())
    : payload instanceof ArrayBuffer
      ? new Uint8Array(payload)
      : ArrayBuffer.isView(payload)
        ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
        : new TextEncoder().encode(String(payload))
  const framed = new Uint8Array(bytes.byteLength + 1)
  framed[0] = route === "wake" ? 1 : 2
  framed.set(bytes, 1)
  ws.send(framed)
}

async function sendVoiceProxyRawPayloadToClient(ws: ServerWebSocket<VoiceProxySocketData>, payload: unknown): Promise<void> {
  if (typeof payload === "string") {
    ws.send(payload)
    return
  }
  if (payload instanceof ArrayBuffer) {
    ws.send(payload)
    return
  }
  if (ArrayBuffer.isView(payload)) {
    ws.send(copyArrayBufferView(payload))
    return
  }
  if (payload instanceof Blob) {
    ws.send(await payload.arrayBuffer())
    return
  }
  ws.send(String(payload))
}

function sendVoiceProxyStatus(ws: ServerWebSocket<VoiceProxySocketData>, type: "status" | "error", message: string): void {
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({type, error: message, message}))
}

function voiceProxyPayloadSize(payload: VoiceProxyPayload): number {
  if (typeof payload === "string") return payload.length
  return payload.byteLength
}

function copyArrayBufferView(view: ArrayBufferView): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

function firstEnv(...keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return null
}
