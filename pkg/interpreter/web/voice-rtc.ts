import {updateVoiceRuntimeState} from "../../../ui/components/voice-runtime-state.ts"
import type {
  VoiceInputAsrSocketContext,
  VoiceInputSocket,
  VoiceTransportControlState,
  VoiceTransportMediaState,
} from "./voice-transport.ts"

const VOICE_RTC_APP_PEER_PREFIX = "app-web-voice"
const VOICE_RTC_SERVER_PEER_ID = "voice-server"
const VOICE_RTC_OFFER_PATH = "/voice/offer"
const VOICE_RTC_ICE_GATHER_TIMEOUT_MS = 8_000
const VOICE_RTC_CONNECT_TIMEOUT_MS = 20_000
const VOICE_RTC_MEDIA_TIMEOUT_MS = 6_000
const VOICE_RTC_ASR_TEXT_TIMEOUT_MS = 18_000
const VOICE_RTC_RETRY_MS = 1_500
const MAX_PENDING_FALLBACK_PCM_BYTES = 16 * 1024 * 1024
const SIGNAL_URL_STORAGE_KEY = "metafor.webrtc.signaling.url"
const DEFAULT_SIGNAL_URL = "wss://signal.proizvodstvo1.ru/ws"

type VoiceRtcAudioMode = "media-track" | "pcm-datachannel"
export type VoiceFallbackFactory = () => VoiceInputSocket

export function createVoiceRtcAsrSocket(
  url: string,
  context: VoiceInputAsrSocketContext,
  fallbackFactory: VoiceFallbackFactory,
): VoiceInputSocket {
  if (typeof RTCPeerConnection === "undefined" || context.stream.getAudioTracks().length === 0) return fallbackFactory()
  return new VoiceRtcAsrSocket(url, context, fallbackFactory)
}

export function voiceRtcAsrWebSocketUrl(raw: string): string {
  const base = typeof location === "undefined" ? "http://localhost/" : location.href
  const url = new URL(raw, base)
  if (url.pathname === "/hud/voice/ws") url.pathname = "/hud/voice/asr/ws"
  if (url.protocol === "http:") url.protocol = "ws:"
  if (url.protocol === "https:") url.protocol = "wss:"
  return url.toString()
}

class VoiceRtcAsrSocket extends EventTarget implements VoiceInputSocket {
  readonly keepAlive = true
  readonly url: string
  binaryType: BinaryType = "arraybuffer"

  #context: VoiceInputAsrSocketContext
  #fallbackFactory: VoiceFallbackFactory
  #peerId = `${VOICE_RTC_APP_PEER_PREFIX}-${crypto.randomUUID()}`
  #readyState: number = WebSocket.CONNECTING
  #mediaState: VoiceTransportMediaState = "connecting"
  #controlState: VoiceTransportControlState = "connecting"
  #audioMode: VoiceRtcAudioMode = "pcm-datachannel"
  #connection: RTCPeerConnection | null = null
  #channel: RTCDataChannel | null = null
  #fallback: VoiceInputSocket | null = null
  #connectTimer: number | null = null
  #mediaTimer: number | null = null
  #asrTextTimer: number | null = null
  #rtcRetryTimer: number | null = null
  #lastStartPayload: string | null = null
  #pendingControls: string[] = []
  #pendingPcm: ArrayBuffer[] = []
  #pendingPcmBytes = 0
  #activationStarted = false
  #closed = false
  #openDispatched = false

  constructor(url: string, context: VoiceInputAsrSocketContext, fallbackFactory: VoiceFallbackFactory) {
    super()
    this.url = url
    this.#context = context
    this.#fallbackFactory = fallbackFactory
    context.onTransport("connecting")
    updateVoiceRuntimeState({transportDetail: "WebRTC offer"})
    void this.#connect()
  }

  get readyState(): number {
    return this.#fallback?.readyState ?? this.#readyState
  }

  get transportKind(): "webrtc" | "websocket" {
    return this.#fallback === null ? "webrtc" : "websocket"
  }

  get mediaState(): VoiceTransportMediaState {
    return this.#fallback === null ? this.#mediaState : "idle"
  }

  get controlState(): VoiceTransportControlState {
    if (this.#fallback === null) return this.#controlState
    return this.#fallback.readyState === WebSocket.OPEN ? "open" : "connecting"
  }

  replaceAudioStream(stream: MediaStream): void {
    this.#context = {...this.#context, stream}
    const track = stream.getAudioTracks()[0] ?? null
    if (track === null) return
    const sender = this.#connection?.getSenders().find((candidate) => candidate.track?.kind === "audio")
    if (sender !== undefined) void sender.replaceTrack(track).catch(() => undefined)
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#clearTimers()
    this.#clearRtcRetryTimer()
    this.#readyState = WebSocket.CLOSING
    const fallback = this.#fallback
    this.#fallback = null
    fallback?.close()
    const channel = this.#channel
    this.#channel = null
    channel?.close()
    const connection = this.#connection
    this.#connection = null
    connection?.close()
    this.#readyState = WebSocket.CLOSED
    this.#mediaState = "idle"
    this.#controlState = "idle"
    this.#context.onTransport("idle")
    updateVoiceRuntimeState({transportDetail: ""})
    this.dispatchEvent(new CloseEvent("close"))
  }

  send(data: string | ArrayBuffer | Blob | ArrayBufferView<ArrayBuffer>): void {
    if (this.#closed) return
    if (typeof data === "string") {
      const replayStoredPcm = this.#trackControl(data)
      const fallback = this.#fallback
      if (fallback !== null) {
        if (fallback.readyState === WebSocket.OPEN) fallback.send(data)
        return
      }
      const channel = this.#channel
      if (channel?.readyState !== "open") return
      if (replayStoredPcm) this.#sendPendingPcm(channel)
      this.#sendRtcControl(data)
      return
    }

    const pcm = binaryDataToArrayBuffer(data)
    if (pcm === null) return
    const fallback = this.#fallback
    if (fallback !== null) {
      if (fallback.readyState === WebSocket.OPEN) fallback.send(pcm)
      else this.#bufferPendingPcm(pcm)
      return
    }

    this.#bufferPendingPcm(pcm)
    if (this.#audioMode === "pcm-datachannel" && this.#channel?.readyState === "open") this.#channel.send(pcm)
  }

  async #connect(): Promise<void> {
    if (this.#closed) return
    this.#armConnectTimer()
    const connection = new RTCPeerConnection({iceServers: [{urls: "stun:stun.l.google.com:19302"}]})
    this.#connection = connection
    for (const track of this.#context.stream.getAudioTracks()) connection.addTrack(track, this.#context.stream)
    connection.addEventListener("connectionstatechange", () => {
      if (this.#connection !== connection) return
      const state = connection.connectionState
      if (state === "connected") this.#mediaState = "flowing"
      if (state === "failed" || state === "closed") this.#startFallback(`WebRTC ${state}`)
    })
    connection.addEventListener("datachannel", (event) => this.#attachChannel(event.channel))
    this.#attachChannel(connection.createDataChannel("voice-asr", {ordered: true}))

    try {
      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      await waitForIceGatheringComplete(connection, VOICE_RTC_ICE_GATHER_TIMEOUT_MS)
      const response = await fetch(voiceRtcOfferUrl(), {
        method: "POST",
        credentials: "include",
        headers: {"content-type": "text/plain"},
        body: JSON.stringify({
          peerId: this.#peerId,
          serverPeerId: VOICE_RTC_SERVER_PEER_ID,
          asrUrl: voiceRtcAsrWebSocketUrl(this.url),
          description: connection.localDescription,
          audioModes: ["media-track", "pcm-datachannel"],
          preferredAudioMode: "media-track",
          controlChannel: "voice-asr",
        }),
      })
      if (!response.ok) throw new Error(`voice WebRTC offer failed: ${response.status}`)
      const body = asRecord(await response.json())
      const description = asAnswer(body?.["description"])
      if (description === null) throw new Error("voice WebRTC answer missing description")
      const audioMode = body?.["audioMode"]
      this.#audioMode = audioMode === "media-track" ? "media-track" : "pcm-datachannel"
      await connection.setRemoteDescription(description)
    } catch (error) {
      if (this.#connection !== connection) return
      const reason = error instanceof Error ? error.message : String(error)
      if (this.#fallback !== null) {
        updateVoiceRuntimeState({transportDetail: `WebSocket fallback · WebRTC retry failed: ${reason}`})
        this.#discardRtc(connection)
        this.#scheduleRtcRecovery()
      } else this.#startFallback(reason)
    }
  }

  #attachChannel(channel: RTCDataChannel): void {
    this.#channel = channel
    channel.binaryType = "arraybuffer"
    channel.addEventListener("open", () => {
      if (this.#closed || this.#channel !== channel) return
      if (this.#fallback !== null && this.#activationStarted) {
        this.#discardRtc(this.#connection)
        return
      }
      if (this.#fallback !== null) {
        const fallback = this.#fallback
        this.#fallback = null
        fallback.close()
      }
      this.#clearConnectTimer()
      this.#clearRtcRetryTimer()
      this.#readyState = WebSocket.OPEN
      this.#controlState = "open"
      this.#mediaState = "flowing"
      this.#context.onTransport("p2p")
      updateVoiceRuntimeState({transportDetail: this.#audioMode === "media-track" ? "WebRTC media + data" : "WebRTC audio data + control"})
      channel.send(JSON.stringify({
        type: "hello",
        peerId: this.#peerId,
        role: "app-web-voice",
        sampleRate: this.#context.sampleRate,
        language: this.#context.language,
        context: this.#context.context,
        audioMode: this.#audioMode,
      }))
      this.#flushPendingRtc(channel)
      this.#dispatchOpenOnce()
    })
    channel.addEventListener("message", (event) => {
      if (this.#channel !== channel) return
      if (typeof event.data === "string" && this.#handleStatus(event.data)) return
      if (typeof event.data === "string") {
        if (asrMessageHasSpeechText(event.data)) this.#clearAsrTextTimer()
        if (asrMessageCommitted(event.data)) this.#clearPendingChunk()
      }
      this.dispatchEvent(new MessageEvent("message", {data: event.data}))
    })
    channel.addEventListener("error", () => {
      if (this.#channel === channel) this.#startFallback("WebRTC data channel error")
    })
    channel.addEventListener("close", () => {
      if (this.#channel === channel) this.#startFallback("WebRTC data channel closed")
    })
  }

  #trackControl(raw: string): boolean {
    const payload = asRecord(safeJsonParse(raw))
    const type = typeof payload?.["type"] === "string" ? payload["type"] : ""
    if (type === "start") {
      this.#activationStarted = true
      this.#lastStartPayload = raw
      this.#pendingControls = []
      this.#clearPendingPcm()
      this.#startMediaTimer()
      return false
    }
    if (type === "stop") {
      this.#activationStarted = false
      this.#lastStartPayload = null
      this.#pendingControls = []
      this.#clearPendingPcm()
      this.#clearMediaTimer()
      this.#clearAsrTextTimer()
      this.#scheduleRtcRecovery()
      return false
    }
    this.#pendingControls.push(raw)
    if (type !== "commit") return false
    this.#startAsrTextTimer()
    const attempts = typeof payload?.["attempts"] === "number"
      ? payload["attempts"]
      : typeof payload?.["attempt"] === "number"
        ? payload["attempt"]
        : 1
    return this.#audioMode === "media-track" && attempts > 1
  }

  #sendRtcControl(raw: string): void {
    this.#channel?.send(JSON.stringify({
      type: "asr-control",
      url: voiceRtcAsrWebSocketUrl(this.url),
      payload: safeJsonParse(raw),
    }))
  }

  #flushPendingRtc(channel: RTCDataChannel): void {
    if (channel.readyState !== "open") return
    if (this.#lastStartPayload !== null) this.#sendRtcControl(this.#lastStartPayload)
    if (this.#audioMode === "pcm-datachannel") this.#sendPendingPcm(channel)
    for (const control of this.#pendingControls) this.#sendRtcControl(control)
  }

  #sendPendingPcm(channel: RTCDataChannel): void {
    if (channel.readyState !== "open") return
    for (const pcm of this.#pendingPcm) channel.send(pcm)
  }

  #handleStatus(raw: string): boolean {
    const message = asRecord(safeJsonParse(raw))
    if (message?.["type"] !== "voice-status") return false
    const state = typeof message["state"] === "string" ? message["state"] : ""
    if (state === "audio") {
      this.#mediaState = "flowing"
      this.#clearMediaTimer()
      this.#context.onTransport("p2p")
      updateVoiceRuntimeState({transportDetail: this.#audioMode === "media-track" ? "WebRTC media + data" : "WebRTC audio data + control"})
    }
    return true
  }

  #startFallback(reason: string): void {
    if (this.#closed || this.#fallback !== null) return
    this.#clearTimers()
    this.#mediaState = "failed"
    this.#controlState = "failed"
    this.#discardRtc(this.#connection)
    updateVoiceRuntimeState({transportDetail: reason})

    const fallback = this.#fallbackFactory()
    fallback.binaryType = this.binaryType
    this.#fallback = fallback
    fallback.addEventListener("open", () => {
      if (this.#closed || this.#fallback !== fallback) return
      this.#readyState = WebSocket.OPEN
      this.#context.onTransport("ws")
      updateVoiceRuntimeState({transportDetail: `WebSocket fallback · ${reason}`})
      if (this.#lastStartPayload !== null) fallback.send(this.#lastStartPayload)
      this.#flushPendingFallbackPcm(fallback)
      for (const control of this.#pendingControls) fallback.send(control)
      this.#dispatchOpenOnce()
    })
    fallback.addEventListener("message", (event) => {
      if (this.#fallback !== fallback) return
      const data = (event as MessageEvent<unknown>).data
      if (typeof data === "string") {
        if (asrMessageHasSpeechText(data)) this.#clearAsrTextTimer()
        if (asrMessageCommitted(data)) this.#clearPendingChunk()
      }
      this.dispatchEvent(new MessageEvent("message", {data}))
    })
    fallback.addEventListener("error", () => {
      if (this.#fallback !== fallback) return
      updateVoiceRuntimeState({transport: "failed", transportDetail: "WebRTC and WebSocket unavailable"})
      this.dispatchEvent(new Event("error"))
    })
    fallback.addEventListener("close", () => {
      if (this.#closed || this.#fallback !== fallback) return
      this.#readyState = WebSocket.CLOSED
      this.#context.onTransport("idle")
      updateVoiceRuntimeState({transport: "failed", transportDetail: "WebRTC and WebSocket unavailable"})
      this.dispatchEvent(new CloseEvent("close"))
    })
  }

  #scheduleRtcRecovery(): void {
    if (this.#closed || this.#fallback === null || this.#activationStarted || this.#rtcRetryTimer !== null) return
    this.#rtcRetryTimer = window.setTimeout(() => {
      this.#rtcRetryTimer = null
      if (this.#closed || this.#fallback === null || this.#activationStarted) return
      this.#discardRtc(this.#connection)
      this.#mediaState = "connecting"
      this.#controlState = "connecting"
      updateVoiceRuntimeState({transportDetail: "WebSocket fallback · retrying WebRTC"})
      void this.#connect()
    }, VOICE_RTC_RETRY_MS)
  }

  #discardRtc(connection: RTCPeerConnection | null): void {
    if (connection !== null && this.#connection !== connection) return
    const channel = this.#channel
    this.#channel = null
    channel?.close()
    const current = this.#connection
    this.#connection = null
    current?.close()
  }

  #clearRtcRetryTimer(): void {
    if (this.#rtcRetryTimer === null) return
    window.clearTimeout(this.#rtcRetryTimer)
    this.#rtcRetryTimer = null
  }

  #dispatchOpenOnce(): void {
    if (this.#openDispatched) return
    this.#openDispatched = true
    this.dispatchEvent(new Event("open"))
  }

  #bufferPendingPcm(buffer: ArrayBuffer): void {
    this.#pendingPcm.push(buffer.slice(0))
    this.#pendingPcmBytes += buffer.byteLength
    while (this.#pendingPcmBytes > MAX_PENDING_FALLBACK_PCM_BYTES && this.#pendingPcm.length > 0) {
      const dropped = this.#pendingPcm.shift()
      this.#pendingPcmBytes -= dropped?.byteLength ?? 0
    }
  }

  #flushPendingFallbackPcm(socket: VoiceInputSocket): void {
    for (const pcm of this.#pendingPcm) socket.send(pcm)
  }

  #clearPendingPcm(): void {
    this.#pendingPcm = []
    this.#pendingPcmBytes = 0
  }

  #clearPendingChunk(): void {
    this.#pendingControls = []
    this.#clearPendingPcm()
  }

  #armConnectTimer(): void {
    this.#clearConnectTimer()
    this.#connectTimer = window.setTimeout(() => {
      if (this.#closed) return
      if (this.#fallback === null) this.#startFallback("WebRTC connection timeout")
      else {
        this.#discardRtc(this.#connection)
        updateVoiceRuntimeState({transportDetail: "WebSocket fallback · WebRTC connection timeout"})
        this.#scheduleRtcRecovery()
      }
    }, VOICE_RTC_CONNECT_TIMEOUT_MS)
  }

  #startMediaTimer(): void {
    this.#clearMediaTimer()
    this.#mediaTimer = window.setTimeout(() => {
      if (this.#activationStarted) this.#startFallback("WebRTC audio timeout")
    }, VOICE_RTC_MEDIA_TIMEOUT_MS)
  }

  #startAsrTextTimer(): void {
    this.#clearAsrTextTimer()
    this.#asrTextTimer = window.setTimeout(() => this.#startFallback("WebRTC ASR response timeout"), VOICE_RTC_ASR_TEXT_TIMEOUT_MS)
  }

  #clearConnectTimer(): void {
    if (this.#connectTimer === null) return
    window.clearTimeout(this.#connectTimer)
    this.#connectTimer = null
  }

  #clearMediaTimer(): void {
    if (this.#mediaTimer === null) return
    window.clearTimeout(this.#mediaTimer)
    this.#mediaTimer = null
  }

  #clearAsrTextTimer(): void {
    if (this.#asrTextTimer === null) return
    window.clearTimeout(this.#asrTextTimer)
    this.#asrTextTimer = null
  }

  #clearTimers(): void {
    this.#clearConnectTimer()
    this.#clearMediaTimer()
    this.#clearAsrTextTimer()
  }
}

function voiceRtcOfferUrl(): string {
  let raw = DEFAULT_SIGNAL_URL
  try {
    const stored = localStorage.getItem(SIGNAL_URL_STORAGE_KEY)?.trim()
    if (stored) raw = stored
  } catch {
    // Keep the default signal origin.
  }
  const url = new URL(raw, location.href)
  url.protocol = url.protocol === "wss:" ? "https:" : "http:"
  url.pathname = VOICE_RTC_OFFER_PATH
  url.search = ""
  url.hash = ""
  return url.toString()
}

function waitForIceGatheringComplete(connection: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (connection.iceGatheringState === "complete") return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      connection.removeEventListener("icegatheringstatechange", onChange)
      resolve()
    }
    const onChange = (): void => {
      if (connection.iceGatheringState === "complete") finish()
    }
    const timer = window.setTimeout(finish, timeoutMs)
    connection.addEventListener("icegatheringstatechange", onChange)
  })
}

function binaryDataToArrayBuffer(data: ArrayBuffer | Blob | ArrayBufferView<ArrayBuffer>): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  return null
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function asAnswer(value: unknown): RTCSessionDescriptionInit | null {
  const record = asRecord(value)
  return record?.["type"] === "answer" && typeof record["sdp"] === "string"
    ? {type: "answer", sdp: record["sdp"]}
    : null
}

function asrMessageCommitted(raw: string): boolean {
  return asRecord(safeJsonParse(raw))?.["type"] === "committed"
}

function asrMessageHasSpeechText(raw: string): boolean {
  const message = asRecord(safeJsonParse(raw))
  if (message === null) return false
  const type = message["type"]
  if (type === "committed") return true
  if (type !== "partial" && type !== "result" && type !== "final") return false
  const text = typeof message["text"] === "string" ? message["text"] : ""
  const json = asRecord(message["json"])
  const nested = typeof json?.["text"] === "string" ? json["text"] : typeof json?.["partial"] === "string" ? json["partial"] : ""
  return /[\p{L}\p{N}]/u.test(`${text} ${nested}`)
}
