import {RTCPeerConnection, type RTCDataChannel} from "werift"
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

export class WeriftPeer {
  readonly peerId: string
  readonly sessionEpoch: string
  readonly protocolReady: Promise<PeerProtocol>
  readonly #connection: RTCPeerConnection
  readonly #onSignal: (signal: PeerSignal) => void
  readonly #onState: (snapshot: WeriftPeerSnapshot) => void
  readonly #channels = new Map<string, RTCDataChannel>()
  readonly #pendingCandidates: Array<Record<string, unknown> | null> = []
  readonly #serveProtocol: boolean
  #resolveProtocol!: (protocol: PeerProtocol) => void
  #protocol: PeerProtocol | null = null
  #remoteDescriptionSet = false
  #oracleRequests = 0
  #forceEvents = 0

  constructor({
    peerId,
    sessionEpoch,
    initiator,
    onSignal,
    onState = () => {},
    serveProtocol = true,
  }: {
    peerId: string
    sessionEpoch: string
    initiator: boolean
    onSignal: (signal: PeerSignal) => void
    onState?: (snapshot: WeriftPeerSnapshot) => void
    serveProtocol?: boolean
  }) {
    this.peerId = peerId
    this.sessionEpoch = sessionEpoch
    this.#onSignal = onSignal
    this.#onState = onState
    this.#serveProtocol = serveProtocol
    this.protocolReady = new Promise((resolve) => {
      this.#resolveProtocol = resolve
    })
    this.#connection = new RTCPeerConnection({maxMessageSize: 64 * 1024})
    this.#connection.onIceCandidate.subscribe((candidate) => {
      this.#onSignal({type: "candidate", candidate: candidate?.toJSON() ?? null})
    })
    this.#connection.connectionStateChange.subscribe((state) => {
      if (state === "failed" || state === "closed") this.#protocol?.close("transport-lost")
      this.#emitState()
    })
    this.#connection.onDataChannel.subscribe((channel) => this.#acceptChannel(channel))

    if (initiator) {
      this.#acceptChannel(this.#connection.createDataChannel("oracle", {ordered: true}))
      this.#acceptChannel(this.#connection.createDataChannel("force", {ordered: true}))
    }
  }

  async start(): Promise<void> {
    const offer = await this.#connection.createOffer()
    const applied = await this.#connection.setLocalDescription(offer)
    const description = applied.toJSON()
    if (description.type !== "offer") throw new Error("initiator produced a non-offer description")
    this.#onSignal({type: "description", description: {type: "offer", sdp: description.sdp}})
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
      const applied = await this.#connection.setLocalDescription(answer)
      const description = applied.toJSON()
      if (description.type !== "answer") throw new Error("answerer produced a non-answer description")
      this.#onSignal({type: "description", description: {type: "answer", sdp: description.sdp}})
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
    this.#emitState()
  }

  #acceptChannel(channel: RTCDataChannel): void {
    if (channel.label !== "oracle" && channel.label !== "force") {
      channel.close()
      return
    }
    this.#channels.set(channel.label, channel)
    channel.addEventListener("open", () => this.#maybeCreateProtocol())
    channel.addEventListener("close", () => this.#emitState())
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
}
