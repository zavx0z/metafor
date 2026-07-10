export type VoiceInputTransport = "idle" | "connecting" | "ws" | "p2p"

export type VoiceTransportMediaState = "idle" | "connecting" | "flowing" | "stalled" | "failed"
export type VoiceTransportControlState = "idle" | "connecting" | "open" | "failed"

export type VoiceInputAsrSocketContext = {
  stream: MediaStream
  sampleRate: number
  language: string
  context: string
  onTransport(transport: VoiceInputTransport): void
}

export type VoiceProtocolMessage = {
  type: string
  sessionId?: string
  turnId?: string
  chunkId?: string
  revision?: number
  captureEpoch?: string
  sequence?: number
  finalSequence?: number
  audioHash?: string
  totalBytes?: number
  sampleRate?: number
  attempts?: number
  reason?: string
  [key: string]: unknown
}

export type VoiceInputSocket = {
  readonly keepAlive?: boolean
  readonly readyState: number
  readonly url: string
  readonly transportKind?: "webrtc" | "websocket"
  readonly mediaState?: VoiceTransportMediaState
  readonly controlState?: VoiceTransportControlState
  binaryType: BinaryType
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  close(): void
  send(data: string | ArrayBuffer | Blob | ArrayBufferView<ArrayBuffer>): void
  sendProtocol?(message: VoiceProtocolMessage): void
}

export type VoiceSocketFactory = (url: string, context: VoiceInputAsrSocketContext) => VoiceInputSocket | null

export function voiceSocketOpen(socket: VoiceInputSocket | null): socket is VoiceInputSocket {
  return socket?.readyState === WebSocket.OPEN
}

export function voiceSocketConnecting(socket: VoiceInputSocket | null): socket is VoiceInputSocket {
  return socket?.readyState === WebSocket.CONNECTING
}

export function createNativeVoiceWebSocket(url: string, context: VoiceInputAsrSocketContext): VoiceInputSocket {
  const ws = new WebSocket(url)
  ws.binaryType = "arraybuffer"
  ws.addEventListener("open", () => context.onTransport("ws"), {once: true})
  ws.addEventListener("close", () => context.onTransport("idle"))
  return ws
}
