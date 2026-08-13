import {NODE_SYSTEM_EDGE_FLOW_MARKER_DURATION_MS} from "@nodes/ui/edge-flow-marker"

export type HamiltonianTrafficPresentationValue = Readonly<{edgeId: string; at: number}>

export type HamiltonianTrafficPresenter<T extends HamiltonianTrafficPresentationValue> = (
  value: T,
  startedAt: number,
) => void

export class HamiltonianTrafficPresentationGate<T extends HamiltonianTrafficPresentationValue> {
  readonly #capacity: number
  readonly #maxAgeMs: number
  readonly #now: () => number
  #materializedEdgeIds = new Set<string>()
  #pending = new Map<string, T>()
  #present: HamiltonianTrafficPresenter<T> | null = null

  constructor(options: Readonly<{capacity?: number; maxAgeMs?: number; now?: () => number}> = {}) {
    this.#capacity = Math.max(1, Math.floor(options.capacity ?? 256))
    this.#maxAgeMs = Math.max(1, Math.floor(options.maxAgeMs ?? NODE_SYSTEM_EDGE_FLOW_MARKER_DURATION_MS))
    this.#now = options.now ?? Date.now
  }

  get pendingCount(): number {
    return this.#pending.size
  }

  observe(value: T): "presented" | "queued" | "expired" {
    const now = this.#now()
    this.#pruneExpired(now)
    if (!Number.isFinite(value.at) || now - value.at >= this.#maxAgeMs) return "expired"
    if (this.#present !== null && this.#materializedEdgeIds.has(value.edgeId)) {
      this.#present(value, value.at)
      return "presented"
    }
    this.#pending.delete(value.edgeId)
    this.#pending.set(value.edgeId, value)
    while (this.#pending.size > this.#capacity) {
      const oldestEdgeId = this.#pending.keys().next().value
      if (oldestEdgeId === undefined) break
      this.#pending.delete(oldestEdgeId)
    }
    return "queued"
  }

  connect(present: HamiltonianTrafficPresenter<T>): void {
    this.#present = present
    this.#flushReady()
  }

  setMaterializedEdges(edgeIds: Iterable<string>): void {
    this.#materializedEdgeIds = new Set(edgeIds)
    this.#flushReady()
  }

  forgetEdge(edgeId: string): number {
    this.#materializedEdgeIds.delete(edgeId)
    return this.#pending.delete(edgeId) ? 1 : 0
  }

  discardPendingOutside(edgeIds: Iterable<string>): number {
    const retained = new Set(edgeIds)
    let discarded = 0
    for (const edgeId of this.#pending.keys()) {
      if (retained.has(edgeId)) continue
      this.#pending.delete(edgeId)
      discarded += 1
    }
    return discarded
  }

  clear(): number {
    const count = this.#pending.size
    this.#pending.clear()
    return count
  }

  disconnect(): void {
    this.#present = null
    this.#materializedEdgeIds.clear()
    this.clear()
  }

  #flushReady(): void {
    if (this.#present === null || this.#pending.size === 0 || this.#materializedEdgeIds.size === 0) return
    this.#pruneExpired(this.#now())
    const ready: T[] = []
    for (const [edgeId, value] of this.#pending) {
      if (!this.#materializedEdgeIds.has(edgeId)) continue
      ready.push(value)
      this.#pending.delete(edgeId)
    }
    if (ready.length === 0) return
    for (const value of ready) this.#present(value, value.at)
  }

  #pruneExpired(now: number): void {
    for (const [edgeId, value] of this.#pending) {
      if (Number.isFinite(value.at) && now - value.at < this.#maxAgeMs) continue
      this.#pending.delete(edgeId)
    }
  }
}
