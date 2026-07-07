import type {ServerWebSocket} from "bun"
import type {Buffer} from "node:buffer"
import {randomUUID} from "node:crypto"

export type VoiceProxyRoute = "wake" | "asr"

type VoiceProxyPayload = string | Buffer<ArrayBuffer>

export type VoiceProxySocketData = {
  kind: "voice-proxy"
  id: string
  route: VoiceProxyRoute
  targetUrl: string
  connectedAt: number
  upstream: WebSocket | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  pending: VoiceProxyPayload[]
  pendingBytes: number
}

const MAX_PENDING_BYTES = 8 * 1024 * 1024
const RECONNECT_DELAY_MS = 700

export function voiceProxyTargetUrl(route: VoiceProxyRoute): string {
  if (route === "wake") {
    return firstEnv("METAFOR_VOICE_WAKE_WS_URL", "VOICE_WAKE_WS_URL") ?? "ws://127.0.0.1:4765/ws"
  }
  return firstEnv("METAFOR_VOICE_ASR_WS_URL", "VOICE_ASR_WS_URL") ?? "ws://127.0.0.1:8787/ws"
}

export function createVoiceProxySocketData(route: VoiceProxyRoute): VoiceProxySocketData {
  return {
    kind: "voice-proxy",
    id: randomUUID(),
    route,
    targetUrl: voiceProxyTargetUrl(route),
    connectedAt: Date.now(),
    upstream: null,
    reconnectTimer: null,
    pending: [],
    pendingBytes: 0,
  }
}

export function attachVoiceProxySocket(ws: ServerWebSocket<VoiceProxySocketData>): void {
  connectVoiceProxyUpstream(ws)
}

function connectVoiceProxyUpstream(ws: ServerWebSocket<VoiceProxySocketData>): void {
  if (ws.readyState !== WebSocket.OPEN) return
  if (ws.data.reconnectTimer !== null) {
    clearTimeout(ws.data.reconnectTimer)
    ws.data.reconnectTimer = null
  }
  if (ws.data.upstream?.readyState === WebSocket.OPEN || ws.data.upstream?.readyState === WebSocket.CONNECTING) return

  const upstream = new WebSocket(ws.data.targetUrl)
  upstream.binaryType = "arraybuffer"
  ws.data.upstream = upstream

  upstream.addEventListener("open", () => {
    flushPendingVoiceProxyMessages(ws, upstream)
  })
  upstream.addEventListener("message", (event) => {
    void sendVoiceProxyPayloadToClient(ws, event.data)
  })
  upstream.addEventListener("error", () => {
    if (ws.data.upstream === upstream) scheduleVoiceProxyReconnect(ws, upstream)
  })
  upstream.addEventListener("close", () => {
    if (ws.data.upstream !== upstream) return
    ws.data.upstream = null
    scheduleVoiceProxyReconnect(ws)
  })
}

function scheduleVoiceProxyReconnect(ws: ServerWebSocket<VoiceProxySocketData>, upstream?: WebSocket): void {
  if (upstream !== undefined && ws.data.upstream === upstream) {
    ws.data.upstream = null
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close()
  }
  if (ws.readyState !== WebSocket.OPEN || ws.data.reconnectTimer !== null) return
  ws.data.reconnectTimer = setTimeout(() => {
    ws.data.reconnectTimer = null
    connectVoiceProxyUpstream(ws)
  }, RECONNECT_DELAY_MS)
}

export function relayVoiceProxyMessage(
  ws: ServerWebSocket<VoiceProxySocketData>,
  message: string | Buffer<ArrayBuffer>,
): void {
  const upstream = ws.data.upstream
  if (upstream?.readyState === WebSocket.OPEN) {
    upstream.send(message)
    return
  }
  if (upstream?.readyState !== WebSocket.CONNECTING) scheduleVoiceProxyReconnect(ws)

  ws.data.pending.push(message)
  ws.data.pendingBytes += voiceProxyPayloadSize(message)
  if (ws.data.pendingBytes > MAX_PENDING_BYTES) {
    ws.data.pending = []
    ws.data.pendingBytes = 0
    closeVoiceProxyClient(ws, 1013, "voice proxy pending buffer limit")
  }
}

export function detachVoiceProxySocket(ws: ServerWebSocket<VoiceProxySocketData>): void {
  const upstream = ws.data.upstream
  ws.data.upstream = null
  if (ws.data.reconnectTimer !== null) {
    clearTimeout(ws.data.reconnectTimer)
    ws.data.reconnectTimer = null
  }
  ws.data.pending = []
  ws.data.pendingBytes = 0
  if (upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) upstream.close()
}

function flushPendingVoiceProxyMessages(ws: ServerWebSocket<VoiceProxySocketData>, upstream: WebSocket): void {
  const pending = ws.data.pending
  ws.data.pending = []
  ws.data.pendingBytes = 0
  for (let index = 0; index < pending.length; index += 1) {
    const payload = pending[index]
    if (payload === undefined) continue
    if (upstream.readyState !== WebSocket.OPEN) {
      const unsent = pending.slice(index)
      ws.data.pending = unsent
      ws.data.pendingBytes = unsent.reduce((size, item) => size + voiceProxyPayloadSize(item), 0)
      scheduleVoiceProxyReconnect(ws, upstream)
      return
    }
    upstream.send(payload)
  }
}

async function sendVoiceProxyPayloadToClient(
  ws: ServerWebSocket<VoiceProxySocketData>,
  payload: unknown,
): Promise<void> {
  if (ws.readyState !== WebSocket.OPEN) return
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

function closeVoiceProxyClient(ws: ServerWebSocket<VoiceProxySocketData>, code: number, reason: string): void {
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(code, reason)
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
