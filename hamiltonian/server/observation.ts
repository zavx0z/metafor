export interface HamiltonianServerEvent {
  at: number
  kind: string
  connectionId?: string
  detail?: string
}

/**
 * Ограниченный журнал диагностических фактов сервера. Он не принимает
 * предметных решений и не является владельцем состояния других механизмов.
 */
export class HamiltonianServerObservation {
  readonly #events: HamiltonianServerEvent[] = []
  readonly #counters = new Map<string, number>()

  record(event: HamiltonianServerEvent): void {
    this.#events.push(event)
    if (this.#events.length > 500) this.#events.splice(0, this.#events.length - 500)
  }

  increment(counter: string): number {
    const value = (this.#counters.get(counter) ?? 0) + 1
    this.#counters.set(counter, value)
    return value
  }

  counter(counter: string): number {
    return this.#counters.get(counter) ?? 0
  }

  events(): readonly HamiltonianServerEvent[] {
    return [...this.#events]
  }
}
