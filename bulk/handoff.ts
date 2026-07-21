import type {ForceMessage} from "shared/protocol/force/message"

export type BulkObserverHandoffOptions = {
  ttlMs?: number
  maxPending?: number
  now?: () => number
}

type PendingHandoff = {
  expiresAt: number
  messages: ForceMessage[]
  timer: ReturnType<typeof setTimeout>
}

/** Bounded Particle buffer spanning only initial package -> WebSocket attachment. */
export class BulkObserverHandoffs {
  readonly #sessions = new Map<string, PendingHandoff>()
  readonly #ttlMs: number
  readonly #maxPending: number
  readonly #now: () => number

  constructor(options: BulkObserverHandoffOptions = {}) {
    this.#ttlMs = options.ttlMs ?? 30_000
    this.#maxPending = options.maxPending ?? 4_096
    this.#now = options.now ?? Date.now
  }

  get size(): number {
    this.#prune()
    return this.#sessions.size
  }

  open(): string {
    this.#prune()
    const session = crypto.randomUUID()
    const timer = setTimeout(() => this.#sessions.delete(session), this.#ttlMs)
    const unrefTimer = timer as ReturnType<typeof setTimeout> & {unref?: () => void}
    unrefTimer.unref?.()
    this.#sessions.set(session, {expiresAt: this.#now() + this.#ttlMs, messages: [], timer})
    return session
  }

  cancel(session: string): void {
    this.#delete(session)
  }

  buffer(message: ForceMessage): void {
    this.#prune()
    for (const [session, pending] of this.#sessions) {
      if (pending.messages.length >= this.#maxPending) {
        this.#delete(session)
        continue
      }
      pending.messages.push(structuredClone(message))
    }
  }

  take(session: string): ForceMessage[] | null {
    this.#prune()
    const pending = this.#sessions.get(session)
    if (!pending) return null
    this.#delete(session)
    return pending.messages
  }

  clear(): void {
    for (const session of this.#sessions.keys()) this.#delete(session)
  }

  #prune(): void {
    const now = this.#now()
    for (const [session, pending] of this.#sessions) {
      if (pending.expiresAt <= now) this.#delete(session)
    }
  }

  #delete(session: string): void {
    const pending = this.#sessions.get(session)
    if (pending) clearTimeout(pending.timer)
    this.#sessions.delete(session)
  }
}
