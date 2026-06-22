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
  pending: VoiceProxyPayload[]
  pendingBytes: number
}

const MAX_PENDING_BYTES = 8 * 1024 * 1024

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
    pending: [],
    pendingBytes: 0,
  }
}

export function attachVoiceProxySocket(ws: ServerWebSocket<VoiceProxySocketData>): void {
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
    closeVoiceProxyClient(ws, 1011, "voice upstream websocket error")
  })
  upstream.addEventListener("close", () => {
    if (ws.data.upstream !== upstream) return
    ws.data.upstream = null
    closeVoiceProxyClient(ws, 1011, "voice upstream websocket closed")
  })
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
  if (upstream?.readyState !== WebSocket.CONNECTING) {
    closeVoiceProxyClient(ws, 1011, "voice upstream websocket unavailable")
    return
  }

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
  ws.data.pending = []
  ws.data.pendingBytes = 0
  if (upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) upstream.close()
}

function flushPendingVoiceProxyMessages(ws: ServerWebSocket<VoiceProxySocketData>, upstream: WebSocket): void {
  const pending = ws.data.pending
  ws.data.pending = []
  ws.data.pendingBytes = 0
  for (const payload of pending) {
    if (upstream.readyState !== WebSocket.OPEN) return
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
