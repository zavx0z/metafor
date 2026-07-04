export type LegacyRtcSignalSocket = EventTarget & {
  readonly readyState: number
  readonly participantId: string
  addEventListener(type: "message", listener: (event: MessageEvent<string>) => void, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: "close", listener: (event: CloseEvent) => void, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: "open" | "error", listener: (event: Event) => void, options?: boolean | AddEventListenerOptions): void
  close(code?: number, reason?: string): void
  send(data: string): void
}

type ParticipantInfo = {
  connectionId: string
  participantId: string
  capabilities?: string[]
}

type P2pServerMessage =
  | {type: "ready"; connectionId: string}
  | {type: "joined"; conversationId: string; self: ParticipantInfo; participants: ParticipantInfo[]}
  | {type: "presence"; conversationId: string; participants: ParticipantInfo[]}
  | {type: "participant:joined"; conversationId: string; participant: ParticipantInfo}
  | {type: "participant:left"; conversationId: string; participant: ParticipantInfo}
  | {
    type: "signal"
    conversationId: string
    callId: string
    kind: "offer" | "answer" | "ice" | "renegotiate" | "bye"
    from?: ParticipantInfo
    fromParticipantId: string
    toParticipantId: string
    payload?: unknown
  }
  | {type: "error"; error: string; message?: string}
  | {type: "delivered"; conversationId: string; callId?: string; count: number}

type LegacyRtcWireMessage = {
  type?: unknown
  to?: unknown
  description?: unknown
  candidate?: unknown
}

export type LegacyRtcSignalSocketOptions = {
  conversationId: string
  participantId: string
  capabilities?: string[]
  meta?: Record<string, unknown>
  url?: string
}

const SIGNAL_URL_STORAGE_KEY = "metafor.webrtc.signaling.url"
const DEFAULT_SIGNAL_URL = "wss://signal.proizvodstvo1.ru/ws"

export const RTC_ICE_SERVERS: RTCIceServer[] = [
  {urls: "stun:stun.l.google.com:19302"},
]

export function createLegacyRtcSignalSocket(options: LegacyRtcSignalSocketOptions): LegacyRtcSignalSocket {
  const url = options.url ?? readSignalUrl()
  if (isInterpreterRtcSignalUrl(url)) return new InterpreterRtcSignalSocketImpl({...options, url})
  return new LegacyRtcSignalSocketImpl({...options, url})
}

class LegacyRtcSignalSocketImpl extends EventTarget implements LegacyRtcSignalSocket {
  readonly participantId: string

  #conversationId: string
  #capabilities: string[]
  #meta: Record<string, unknown> | undefined
  #ws: WebSocket
  #connectionId = ""
  #participants = new Map<string, ParticipantInfo>()
  #callIds = new Map<string, string>()

  constructor(options: LegacyRtcSignalSocketOptions) {
    super()
    this.#conversationId = options.conversationId
    this.participantId = options.participantId
    this.#capabilities = options.capabilities ?? []
    this.#meta = options.meta
    this.#ws = new WebSocket(options.url ?? readSignalUrl())
    this.#ws.addEventListener("open", () => {
      this.dispatchEvent(new Event("open"))
      this.#sendJson({
        type: "join",
        conversationId: this.#conversationId,
        participantId: this.participantId,
        capabilities: this.#capabilities,
        meta: this.#meta ?? {
          href: location.href,
          userAgent: navigator.userAgent,
        },
      })
    })
    this.#ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return
      const message = parseP2pMessage(event.data)
      if (message === null) return
      this.#handleMessage(message)
    })
    this.#ws.addEventListener("error", () => this.dispatchEvent(new Event("error")))
    this.#ws.addEventListener("close", (event) => {
      this.dispatchEvent(new CloseEvent("close", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      }))
    })
  }

  override addEventListener(type: "message", listener: (event: MessageEvent<string>) => void, options?: boolean | AddEventListenerOptions): void
  override addEventListener(type: "close", listener: (event: CloseEvent) => void, options?: boolean | AddEventListenerOptions): void
  override addEventListener(type: "open" | "error", listener: (event: Event) => void, options?: boolean | AddEventListenerOptions): void
  override addEventListener(type: string, listener: unknown, options?: boolean | AddEventListenerOptions): void {
    super.addEventListener(type, listener as EventListenerOrEventListenerObject | null, options)
  }

  get readyState(): number {
    return this.#ws.readyState
  }

  close(code?: number, reason?: string): void {
    this.#ws.close(code, reason)
  }

  send(data: string): void {
    const message = parseLegacyWireMessage(data)
    if (message === null) return
    const kind = legacySignalKind(message.type)
    const toParticipantId = typeof message.to === "string" ? message.to : null
    if (kind === null || toParticipantId === null) return
    const callId = this.#callIds.get(toParticipantId) ?? this.#createCallId(toParticipantId)
    this.#sendJson({
      type: "signal",
      conversationId: this.#conversationId,
      callId,
      kind,
      fromParticipantId: this.participantId,
      toParticipantId,
      payload: kind === "ice" ? message.candidate : message.description,
    })
  }

  #handleMessage(message: P2pServerMessage): void {
    if (message.type === "ready") {
      this.#connectionId = message.connectionId
      return
    }
    if (message.type === "joined") {
      this.#participants = new Map(
        message.participants
          .filter((participant) => participant.participantId !== this.participantId)
          .map((participant) => [participant.participantId, participant] as const),
      )
      this.#dispatchLegacy({
        type: "hello",
        room: this.#conversationId,
        peerId: this.participantId,
        connectionId: this.#connectionId,
        peers: [...this.#participants.keys()],
      })
      return
    }
    if (message.type === "participant:joined") {
      if (message.participant.participantId === this.participantId) return
      const existing = this.#participants.has(message.participant.participantId)
      this.#participants.set(message.participant.participantId, message.participant)
      if (!existing) this.#dispatchLegacy({type: "peer-joined", peerId: message.participant.participantId})
      return
    }
    if (message.type === "participant:left") {
      if (message.participant.participantId === this.participantId) return
      this.#participants.delete(message.participant.participantId)
      this.#callIds.delete(message.participant.participantId)
      this.#dispatchLegacy({type: "peer-left", peerId: message.participant.participantId})
      return
    }
    if (message.type === "signal") {
      if (message.toParticipantId !== this.participantId) return
      this.#callIds.set(message.fromParticipantId, message.callId)
      if (message.kind === "bye") {
        this.#dispatchLegacy({type: "peer-left", peerId: message.fromParticipantId})
        return
      }
      this.#dispatchLegacy({
        type: message.kind,
        room: this.#conversationId,
        from: message.fromParticipantId,
        to: this.participantId,
        ...(message.kind === "ice" ? {candidate: message.payload} : {description: message.payload}),
      })
    }
  }

  #createCallId(toParticipantId: string): string {
    const callId = `${this.participantId}:${toParticipantId}:${rtcRandomToken()}`
    this.#callIds.set(toParticipantId, callId)
    return callId
  }

  #sendJson(value: unknown): void {
    if (this.#ws.readyState !== WebSocket.OPEN) return
    this.#ws.send(JSON.stringify(value))
  }

  #dispatchLegacy(value: Record<string, unknown>): void {
    this.dispatchEvent(new MessageEvent("message", {data: JSON.stringify(value)}))
  }
}

function rtcRandomToken(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

class InterpreterRtcSignalSocketImpl extends EventTarget implements LegacyRtcSignalSocket {
  readonly participantId: string

  #ws: WebSocket

  constructor(options: LegacyRtcSignalSocketOptions & {url: string}) {
    super()
    this.participantId = options.participantId
    const url = new URL(options.url, location.href)
    url.searchParams.set("room", options.conversationId)
    url.searchParams.set("peer", options.participantId)
    this.#ws = new WebSocket(url)
    this.#ws.addEventListener("open", () => this.dispatchEvent(new Event("open")))
    this.#ws.addEventListener("message", (event) => {
      if (typeof event.data === "string") this.dispatchEvent(new MessageEvent("message", {data: event.data}))
    })
    this.#ws.addEventListener("error", () => this.dispatchEvent(new Event("error")))
    this.#ws.addEventListener("close", (event) => {
      this.dispatchEvent(new CloseEvent("close", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      }))
    })
  }

  override addEventListener(type: "message", listener: (event: MessageEvent<string>) => void, options?: boolean | AddEventListenerOptions): void
  override addEventListener(type: "close", listener: (event: CloseEvent) => void, options?: boolean | AddEventListenerOptions): void
  override addEventListener(type: "open" | "error", listener: (event: Event) => void, options?: boolean | AddEventListenerOptions): void
  override addEventListener(type: string, listener: unknown, options?: boolean | AddEventListenerOptions): void {
    super.addEventListener(type, listener as EventListenerOrEventListenerObject | null, options)
  }

  get readyState(): number {
    return this.#ws.readyState
  }

  close(code?: number, reason?: string): void {
    this.#ws.close(code, reason)
  }

  send(data: string): void {
    if (this.#ws.readyState !== WebSocket.OPEN) return
    this.#ws.send(data)
  }
}

function readSignalUrl(): string {
  try {
    const stored = localStorage.getItem(SIGNAL_URL_STORAGE_KEY)?.trim()
    if (stored) return stored
  } catch {
    // Storage can be disabled.
  }
  return DEFAULT_SIGNAL_URL
}

function isInterpreterRtcSignalUrl(value: string): boolean {
  try {
    const url = new URL(value, location.href)
    return url.pathname === "/webrtc/signaling"
      || url.pathname === "/hud/android/webrtc/signaling"
  } catch {
    return false
  }
}

function parseP2pMessage(raw: string): P2pServerMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
    const type = (parsed as {type?: unknown}).type
    return typeof type === "string" ? parsed as P2pServerMessage : null
  } catch {
    return null
  }
}

function parseLegacyWireMessage(raw: string): LegacyRtcWireMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
    return parsed as LegacyRtcWireMessage
  } catch {
    return null
  }
}

function legacySignalKind(type: unknown): "offer" | "answer" | "ice" | null {
  if (type === "offer" || type === "answer" || type === "ice") return type
  return null
}
