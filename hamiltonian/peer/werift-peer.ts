import {RTCPeerConnection, type RTCDataChannel, type RTCIceServer} from "werift"
import {LogicalChannelSession, PeerProtocol} from "../core/runtime.js"

export type PeerSignal =
  | {type: "description"; description: {type: "offer" | "answer"; sdp: string}}
  | {type: "candidate"; candidate: Record<string, unknown> | null}

export interface WeriftPeerSnapshot {
  peerId: string
  sessionEpoch: string
  state: string
  channels: string[]
  oracleRequests: number
  forceEvents: number
}

export type WeriftPeerLifecycleEvent =
  | {
      kind: "rtc-peer"
      phase: "born" | "changed" | "ended"
      state: string
      reason?: string
    }
  | {
      kind: "data-channel"
      phase: "opening" | "opened" | "closed"
      label: "oracle" | "force"
      state: string
    }
  | {
      kind: "data-channel-message"
      phase: "sent" | "received"
      label: "oracle" | "force"
      messageId: string
      messageClass: string
      sequence: number
    }

export class WeriftPeer {
  readonly peerId: string
  readonly sessionEpoch: string
  readonly protocolReady: Promise<PeerProtocol>
  readonly #connection: RTCPeerConnection
  readonly #onSignal: (signal: PeerSignal) => void
  readonly #onState: (snapshot: WeriftPeerSnapshot) => void
  readonly #onLifecycle: (event: WeriftPeerLifecycleEvent) => void
  readonly #onError: (error: Error) => void
  readonly #channels = new Map<string, RTCDataChannel>()
  readonly #channelStates = new WeakMap<RTCDataChannel, string>()
  readonly #pendingCandidates: Array<Record<string, unknown> | null> = []
  readonly #serveProtocol: boolean
  #resolveProtocol!: (protocol: PeerProtocol) => void
  #protocol: PeerProtocol | null = null
  #remoteDescriptionSet = false
  #oracleRequests = 0
  #forceEvents = 0
  #peerEnded = false

  constructor({
    peerId,
    sessionEpoch,
    initiator,
    onSignal,
    onState = () => {},
    onLifecycle = () => {},
    onError = () => {},
    iceServers,
    iceLite,
    serveProtocol = true,
  }: {
    peerId: string
    sessionEpoch: string
    initiator: boolean
    onSignal: (signal: PeerSignal) => void
    onState?: (snapshot: WeriftPeerSnapshot) => void
    onLifecycle?: (event: WeriftPeerLifecycleEvent) => void
    onError?: (error: Error) => void
    iceServers?: RTCIceServer[]
    iceLite?: boolean
    serveProtocol?: boolean
  }) {
    this.peerId = peerId
    this.sessionEpoch = sessionEpoch
    this.#onSignal = onSignal
    this.#onState = onState
    this.#onLifecycle = onLifecycle
    this.#onError = onError
    this.#serveProtocol = serveProtocol
    this.protocolReady = new Promise((resolve) => {
      this.#resolveProtocol = resolve
    })
    this.#connection = new RTCPeerConnection({
      maxMessageSize: 64 * 1024,
      ...(iceServers === undefined ? {} : {iceServers}),
      ...(iceLite === undefined ? {} : {iceLite}),
    })
    this.#connection.onIceCandidate.subscribe((candidate) => {
      this.#onSignal({type: "candidate", candidate: candidate?.toJSON() ?? null})
    })
    this.#connection.connectionStateChange.subscribe((state) => {
      if (state === "failed" || state === "closed") this.#protocol?.close("transport-lost")
      if (state === "closed") this.#emitPeerEnded("connection-closed")
      else this.#emitLifecycle({kind: "rtc-peer", phase: "changed", state})
      this.#emitState()
    })
    this.#connection.onDataChannel.subscribe((channel) => this.#acceptChannel(channel))

    this.#emitLifecycle({kind: "rtc-peer", phase: "born", state: this.#connection.connectionState})

    if (initiator) {
      this.#acceptChannel(this.#connection.createDataChannel("oracle", {ordered: true}))
      this.#acceptChannel(this.#connection.createDataChannel("force", {ordered: true}))
    }
  }

  async start(): Promise<void> {
    const offer = await this.#connection.createOffer()
    if (offer.type !== "offer") throw new Error("initiator produced a non-offer description")
    const applying = this.#connection.setLocalDescription(offer)
    this.#onSignal({type: "description", description: {type: "offer", sdp: offer.sdp}})
    void applying.catch((error) => this.#reportError("local offer", error))
  }

  async signal(signal: PeerSignal): Promise<void> {
    if (signal.type === "candidate") {
      if (!this.#remoteDescriptionSet) {
        this.#pendingCandidates.push(signal.candidate)
        return
      }
      await this.#connection.addIceCandidate(signal.candidate)
      return
    }

    await this.#connection.setRemoteDescription(signal.description)
    this.#remoteDescriptionSet = true
    for (const candidate of this.#pendingCandidates.splice(0)) {
      await this.#connection.addIceCandidate(candidate)
    }
    if (signal.description.type === "offer") {
      const answer = await this.#connection.createAnswer()
      if (answer.type !== "answer") throw new Error("answerer produced a non-answer description")
      const applying = this.#connection.setLocalDescription(answer)
      this.#onSignal({type: "description", description: {type: "answer", sdp: answer.sdp}})
      void applying.catch((error) => this.#reportError("local answer", error))
    }
  }

  snapshot(): WeriftPeerSnapshot {
    return {
      peerId: this.peerId,
      sessionEpoch: this.sessionEpoch,
      state: this.#connection.connectionState,
      channels: [...this.#channels].filter(([, channel]) => channel.readyState === "open").map(([label]) => label),
      oracleRequests: this.#oracleRequests,
      forceEvents: this.#forceEvents,
    }
  }

  async close(): Promise<void> {
    this.#protocol?.close("peer-closed")
    await this.#connection.close()
    this.#emitPeerEnded("peer-closed")
    this.#emitState()
  }

  #acceptChannel(channel: RTCDataChannel): void {
    if (channel.label !== "oracle" && channel.label !== "force") {
      channel.close()
      return
    }
    this.#channels.set(channel.label, channel)
    this.#emitChannel(channel, "opening")
    channel.addEventListener("open", () => {
      this.#emitChannel(channel, "opened")
      this.#maybeCreateProtocol()
    })
    channel.addEventListener("close", () => {
      this.#emitChannel(channel, "closed")
      this.#emitState()
    })
    if (channel.readyState === "open") this.#emitChannel(channel, "opened")
    this.#maybeCreateProtocol()
  }

  #maybeCreateProtocol(): void {
    if (this.#protocol || this.#channels.size !== 2) return
    const oracle = this.#channels.get("oracle")!
    const force = this.#channels.get("force")!
    if (oracle.readyState !== "open" || force.readyState !== "open") return
    const session = new LogicalChannelSession({
      sessionEpoch: this.sessionEpoch,
      lanes: {oracle, force},
      onProtocolEvent: () => this.#emitState(),
      onTraffic: (event) => this.#emitLifecycle({
        kind: "data-channel-message",
        phase: event.direction === "forward" ? "sent" : "received",
        label: event.lane,
        messageId: event.messageId,
        messageClass: event.messageClass,
        sequence: event.sequence,
      }),
    })
    this.#protocol = new PeerProtocol(session)
    if (this.#serveProtocol) {
      this.#protocol.register("probe", (params: unknown) => {
        this.#oracleRequests += 1
        this.#emitState()
        return {echo: params, peerId: this.peerId, sessionEpoch: this.sessionEpoch}
      })
      this.#protocol.onForce((event: {particle: unknown; sequence: number}) => {
        this.#forceEvents += 1
        this.#protocol?.publishForce({echo: event.particle, receivedSequence: event.sequence})
        this.#emitState()
      })
    }
    this.#resolveProtocol(this.#protocol)
    this.#emitState()
  }

  #emitState(): void {
    this.#onState(this.snapshot())
  }

  #emitChannel(channel: RTCDataChannel, phase: "opening" | "opened" | "closed"): void {
    const previous = this.#channelStates.get(channel)
    if (previous === phase || previous === "closed") return
    this.#channelStates.set(channel, phase)
    this.#emitLifecycle({
      kind: "data-channel",
      phase,
      label: channel.label as "oracle" | "force",
      state: channel.readyState,
    })
  }

  #emitPeerEnded(reason: string): void {
    if (this.#peerEnded) return
    this.#peerEnded = true
    this.#emitLifecycle({kind: "rtc-peer", phase: "ended", state: "closed", reason})
  }

  #emitLifecycle(event: WeriftPeerLifecycleEvent): void {
    try {
      this.#onLifecycle(event)
    } catch {}
  }

  #reportError(stage: string, value: unknown): void {
    const cause = value instanceof Error ? value.message : String(value)
    const error = new Error(`${stage}: ${cause}`)
    this.#emitLifecycle({kind: "rtc-peer", phase: "changed", state: "failed", reason: error.message})
    try {
      this.#onError(error)
    } catch {}
  }
}
