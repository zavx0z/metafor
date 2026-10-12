/**
Bounded send reservations over a caller-owned physical peer lane. This adapter
never creates or closes PeerNetwork; transport acknowledgement is not application
processing or a canonical receipt. [Force law](../../docs/FORCE.md).
@packageDocumentation
*/
import type {PeerNetwork} from "@metafor/tech-peer"

export type PeerLane = {network: PeerNetwork, peerId: string, physicalChannel: "oracle" | "force", channel: string}
export class PeerLaneQueue {
  #queued = 0
  #closed = false
  readonly #pending = new Set<Promise<void>>()
  constructor(private readonly lane: PeerLane, private readonly limit: number, private readonly failed: (error: Error) => void) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Peer lane queue limit is invalid")
  }
  enqueue(payload: string): Promise<void> {
    if (this.#closed) throw new Error("Peer lane is closed")
    const bytes = new TextEncoder().encode(payload).byteLength
    if (bytes > (this.lane.network.maxMessageBytes ?? 16 * 1024 * 1024)) throw new Error("Peer lane message exceeds limit")
    if (this.#queued + bytes > this.limit) throw new Error("Peer lane send queue exceeds limit")
    this.#queued += bytes
    let work: Promise<void>
    try {work = this.lane.network.send(this.lane.peerId, payload, {channel: this.lane.channel, physicalChannel: this.lane.physicalChannel})}
    catch (error) {this.#queued -= bytes; throw error}
    const tracked = work.catch(error => {this.failed(error instanceof Error ? error : new Error("Peer lane send failed")); throw error})
      .finally(() => {this.#queued -= bytes; this.#pending.delete(tracked)})
    this.#pending.add(tracked)
    void tracked.catch(() => {})
    return tracked
  }
  close(): void {this.#closed = true}
  async whenIdle(): Promise<void> {await Promise.allSettled([...this.#pending])}
}

export function peerGeneration(network: PeerNetwork, peerId: string): string | undefined {
  return network.snapshot().links.find(link => link.peerId === peerId && link.state === "open")?.generation
}
