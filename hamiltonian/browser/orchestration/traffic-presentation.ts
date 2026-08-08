export type HamiltonianTrafficPresentationValue = Readonly<{edgeId: string}>

export type HamiltonianTrafficPresenter<T extends HamiltonianTrafficPresentationValue> = (
  value: T,
  startedAt: number,
) => void

export class HamiltonianTrafficPresentationGate<T extends HamiltonianTrafficPresentationValue> {
  readonly #capacity: number
  readonly #now: () => number
  #materializedEdgeIds = new Set<string>()
  #pending: T[] = []
  #present: HamiltonianTrafficPresenter<T> | null = null

  constructor(options: Readonly<{capacity?: number; now?: () => number}> = {}) {
    this.#capacity = Math.max(1, Math.floor(options.capacity ?? 256))
    this.#now = options.now ?? Date.now
  }

  get pendingCount(): number {
    return this.#pending.length
  }

  observe(value: T): "presented" | "queued" {
    if (this.#present !== null && this.#materializedEdgeIds.has(value.edgeId)) {
      this.#present(value, this.#now())
      return "presented"
    }
    this.#pending.push(value)
    if (this.#pending.length > this.#capacity) {
      this.#pending.splice(0, this.#pending.length - this.#capacity)
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

  clear(): number {
    const count = this.#pending.length
    this.#pending = []
    return count
  }

  disconnect(): void {
    this.#present = null
    this.#materializedEdgeIds.clear()
    this.clear()
  }

  #flushReady(): void {
    if (this.#present === null || this.#pending.length === 0 || this.#materializedEdgeIds.size === 0) return
    const ready: T[] = []
    const waiting: T[] = []
    for (const value of this.#pending) {
      if (this.#materializedEdgeIds.has(value.edgeId)) ready.push(value)
      else waiting.push(value)
    }
    this.#pending = waiting
    if (ready.length === 0) return
    const startedAt = this.#now()
    for (const value of ready) this.#present(value, startedAt)
  }
}
