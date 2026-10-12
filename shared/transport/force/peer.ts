/**
Force client over an injected PeerNetwork. Construct only after Oracle hydration:
force.open is transport readiness, never a Particle or canonical applied receipt.
The adapter owns subscriptions/queues, not the network or process lifecycle.
[Force path](../../../docs/FORCE.md), [foundation checks](../../../quantum/dark/force/peer.spec.ts).
@packageDocumentation
*/
import type {PeerNetwork} from "@metafor/tech-peer"
import {sourceForceMessage, unsourceForceMessage, type ForceMessage, type ForceMessageInput, type SourcedForceMessage} from "../../protocol/force/message"
import {ForceBase} from "./base"
import {PeerLaneQueue, peerGeneration} from "../peer-lane"

export const PEER_FORCE_CHANNEL = "quantum.force.v1"
export const PEER_FORCE_CONTROL = "quantum.force.control.v1"
export function readPeerForce(payload: string | Uint8Array, source?: string): SourcedForceMessage {
  if (typeof payload !== "string") throw new Error("Force peer requires JSON text")
  const value = JSON.parse(payload) as ForceMessage
  if (!value || !Array.isArray(value.parts) || value.parts.length !== 1 || !value.parts[0] || typeof value.parts[0] !== "object") throw new Error("Force peer requires one Particle")
  if (source !== undefined) return sourceForceMessage(unsourceForceMessage(value), source)
  if (typeof value.parts[0].by !== "string" || !value.parts[0].by) throw new Error("Force peer requires sourced Particle")
  return value as SourcedForceMessage
}

/** Bounded synchronous impulse admission; asynchronous delivery failure closes this client. */
export class PeerForce extends ForceBase {
  override readonly id: string
  override onDestroy?: () => void | Promise<void>
  readonly #queue: PeerLaneQueue
  readonly #off: (() => void)[] = []
  #generation: string | undefined
  #closed = false
  #closing: Promise<void> | undefined
  #opening = true
  #confirmed = false
  #openingQueue: string[] = []
  #openingBytes = 0
  readonly #limit: number
  constructor(override readonly domain: string, private readonly options: {network: PeerNetwork, peerId: string, onFailure(error: Error): void, maxQueuedBytes?: number, openTimeoutMs?: number}) {
    super()
    this.id = `${domain}-peer`
    this.#limit = options.maxQueuedBytes ?? 64 * 1024 * 1024
    if (!Number.isSafeInteger(options.openTimeoutMs ?? 30_000) || (options.openTimeoutMs ?? 30_000) < 1) throw new Error("Force peer opening timeout is invalid")
    this.#queue = new PeerLaneQueue({...options, physicalChannel: "force", channel: PEER_FORCE_CHANNEL}, this.#limit, error => this.#fail(error))
    this.bindCheckpointDrain()
    const timer = setTimeout(() => this.#fail(new Error("Force peer opening timed out")), options.openTimeoutMs ?? 30_000)
    this.#off.push(() => clearTimeout(timer))
    this.#off.push(options.network.onData(event => {
      if (event.peerId !== options.peerId || this.#closed) return
      try {
        if (event.physicalChannel === "oracle" && event.channel === PEER_FORCE_CONTROL) {
          const value = typeof event.data === "string" ? JSON.parse(event.data) : null
          if (!value || (value.kind !== "force.opened" && value.kind !== "force.active")) throw new Error("Invalid Force peer opening")
          if (!this.#opening) return
          if (value.kind === "force.opened") {
            this.#confirmed = true
            void options.network.send(options.peerId, JSON.stringify({kind: "force.ready"}), {physicalChannel: "oracle", channel: PEER_FORCE_CONTROL})
              .catch(error => this.#fail(error instanceof Error ? error : new Error("Force peer readiness failed")))
            return
          }
          if (!this.#confirmed) throw new Error("Force peer active before opening")
          this.#opening = false
          clearTimeout(timer)
          for (const payload of this.#openingQueue.splice(0)) void this.#queue.enqueue(payload).catch(() => {})
          this.#openingBytes = 0
          this.emitConnection(true)
        } else if (event.physicalChannel === "force" && event.channel === PEER_FORCE_CHANNEL) {
          if (!this.#confirmed) throw new Error("Force peer not opened")
          this.emitImpulse(readPeerForce(event.data))
        }
      } catch (error) {this.#fail(error instanceof Error ? error : new Error("Force peer receive failed"))}
    }))
    this.#off.push(options.network.subscribe(() => {
      if (this.#generation && peerGeneration(options.network, options.peerId) !== this.#generation) this.#fail(new Error("Force peer generation closed"))
    }))
    void options.network.connect(options.peerId).then(async () => {
      if (this.#closed) return
      this.#generation = peerGeneration(options.network, options.peerId)
      await options.network.send(options.peerId, JSON.stringify({kind: "force.open"}), {physicalChannel: "oracle", channel: PEER_FORCE_CONTROL})
    }).catch(error => this.#fail(error instanceof Error ? error : new Error("Force peer opening failed")))
  }
  override impulse(input: ForceMessageInput): void {
    if (this.#closed) throw new Error("Force peer is closed")
    const payload = JSON.stringify(sourceForceMessage(input, this.domain))
    const bytes = new TextEncoder().encode(payload).byteLength
    if (bytes > (this.options.network.maxMessageBytes ?? 16 * 1024 * 1024)) throw new Error("Force peer message exceeds limit")
    if (this.#opening) {
      if (this.#openingBytes + bytes > this.#limit) throw new Error("Force peer send queue exceeds limit")
      this.#openingBytes += bytes
      this.#openingQueue.push(payload)
    } else void this.#queue.enqueue(payload).catch(() => {})
    this.checkpointOutgoing()
  }
  close(): Promise<void> {
    this.#closing ??= (async () => {
      this.#closed = true
      if (this.#generation) void this.options.network.send(this.options.peerId, JSON.stringify({kind: "force.close"}), {physicalChannel: "oracle", channel: PEER_FORCE_CONTROL}).catch(() => {})
      this.emitConnection(false)
      this.#queue.close()
      this.#openingQueue = []
      this.#openingBytes = 0
      for (const off of this.#off.splice(0)) off()
      await this.onDestroy?.()
    })()
    return this.#closing
  }
  #fail(error: Error) {if (this.#closed) return; void this.close().catch(() => {}); this.options.onFailure(error)}
}
