import type {ForceMessage} from "../../protocol/force/message.ts"
import type {MonadRpcPeer} from "../monad/peer.ts"

export const FORCE_CHECKPOINT_SESSION_METHOD = "force.checkpoint.session.open" as const
export const FORCE_CHECKPOINT_PREPARE_METHOD = "force.checkpoint.delivery.prepare" as const
export const FORCE_CHECKPOINT_WAIT_APPLIED_METHOD = "force.checkpoint.delivery.waitApplied" as const
export const FORCE_CHECKPOINT_OUTGOING_THROUGH_METHOD = "force.checkpoint.outgoing.waitAccepted" as const
export const FORCE_CHECKPOINT_QUIESCE_METHOD = "force.checkpoint.domain.quiesce" as const

export const checkpointForceDomains = ["dark", "boundary", "matrix", "energy", "bulk"] as const
export type CheckpointForceDomain = typeof checkpointForceDomains[number]

export type ForceCheckpointDeliveryReceipt = {
  cutId: string
  domain: CheckpointForceDomain
  sentOrdinal: number
  acceptanceSequence: number
}

export type ForceCheckpointSession = {
  cutId: string
  domain: CheckpointForceDomain
  deliveredOrdinal: number
  acceptedOutgoingOrdinal: number
}

/**
 * The causal cut a domain has actually applied.
 *
 * `acceptanceSequence` is Dark's monotonic acceptance ordinal for the last
 * delivery this domain finished handling — not an authored `Particle.ts`, which
 * is a wall-clock stamp and orders nothing. A consumer that resumes from this
 * pair asks for exactly the deliveries it has not seen.
 */
export type ForceCheckpointFrontier = {
  acceptanceSequence: number
  cutId: string
  deliveredOrdinal: number
  domain: CheckpointForceDomain
}

type PendingDelivery = {
  receipt: ForceCheckpointDeliveryReceipt
  applied: Promise<void>
  resolve(): void
  reject(error: unknown): void
}

type CheckpointPeer = Pick<MonadRpcPeer, "call" | "expose">

const domainSet = new Set<string>(checkpointForceDomains)
const controllers = new Map<string, ForceCheckpointDomainSideband>()

const record = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return null
  return value as Record<string, unknown>
}

const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const own = Reflect.ownKeys(value)
  return own.length === keys.length && own.every((key) => {
    if (typeof key !== "string" || !keys.includes(key)) return false
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
    return Boolean(descriptor && descriptor.enumerable && "value" in descriptor)
  })
}

const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0

const nonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0

const canonicalDomain = (value: unknown): value is CheckpointForceDomain =>
  typeof value === "string" && domainSet.has(value)

const deferred = (receipt: ForceCheckpointDeliveryReceipt): PendingDelivery => {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const applied = new Promise<void>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return {receipt, applied, resolve, reject}
}

/**
 * Domain-local control-plane sideband.
 *
 * No receipt is put into ForceMessage or Particle history. Dark prepares one
 * receipt before sending the corresponding Force WebSocket message. The domain
 * resolves it only after its sequential handler has finished and every Particle
 * emitted by that handler has reached Dark's durable acceptance point.
 */
export class ForceCheckpointDomainSideband {
  readonly domain: CheckpointForceDomain
  #cutId: string | null = null
  #preparedOrdinal = 0
  #deliveredOrdinal = 0
  #outgoingOrdinal = 0
  #appliedOrdinal = 0
  #appliedAcceptanceSequence = 0
  #prepared: PendingDelivery[] = []
  #deliveries = new Map<number, PendingDelivery>()
  #drain: () => Promise<void> = async () => {}
  #quiescence: () => Promise<void> = async () => {}

  constructor(
    domain: string,
    private readonly peer: CheckpointPeer,
  ) {
    if (!canonicalDomain(domain)) throw new Error(`Checkpoint sideband domain is invalid: ${domain}`)
    this.domain = domain
    peer.expose(FORCE_CHECKPOINT_PREPARE_METHOD, async (input) => this.prepare(input))
    peer.expose(FORCE_CHECKPOINT_WAIT_APPLIED_METHOD, async (input) => await this.waitApplied(input))
    peer.expose(FORCE_CHECKPOINT_QUIESCE_METHOD, async () => await this.quiesce())
  }

  async open(): Promise<ForceCheckpointSession> {
    const value = await this.peer.call<unknown>(
      "dark",
      FORCE_CHECKPOINT_SESSION_METHOD,
      {domain: this.domain},
      {waitMs: 30_000},
    )
    const input = record(value)
    if (
      !input ||
      !exact(input, ["cutId", "domain", "deliveredOrdinal", "acceptedOutgoingOrdinal"]) ||
      typeof input.cutId !== "string" ||
      input.domain !== this.domain ||
      !nonNegative(input.deliveredOrdinal) ||
      !nonNegative(input.acceptedOutgoingOrdinal)
    ) throw new Error(`Dark returned an invalid checkpoint session for ${this.domain}`)
    this.#cutId = input.cutId
    this.#preparedOrdinal = input.deliveredOrdinal
    this.#deliveredOrdinal = input.deliveredOrdinal
    this.#outgoingOrdinal = input.acceptedOutgoingOrdinal
    this.#appliedOrdinal = input.deliveredOrdinal
    return {
      cutId: input.cutId,
      domain: this.domain,
      deliveredOrdinal: input.deliveredOrdinal,
      acceptedOutgoingOrdinal: input.acceptedOutgoingOrdinal,
    }
  }

  bindDrain(drain: () => Promise<void>): void {
    this.#drain = drain
  }

  bindQuiescence(quiescence: () => Promise<void>): void {
    this.#quiescence = quiescence
  }

  trackOutgoing(): number {
    if (!this.#cutId) throw new Error(`Checkpoint sideband is not open for ${this.domain}`)
    this.#outgoingOrdinal += 1
    return this.#outgoingOrdinal
  }

  /**
   * The causal cut this domain has finished applying, or `null` before the
   * session opens. A resuming consumer compares its own pair against this one
   * instead of against an authored timestamp.
   */
  frontier(): ForceCheckpointFrontier | null {
    if (!this.#cutId) return null
    return {
      acceptanceSequence: this.#appliedAcceptanceSequence,
      cutId: this.#cutId,
      deliveredOrdinal: this.#appliedOrdinal,
      domain: this.domain,
    }
  }

  async processIncoming(
    message: ForceMessage,
    handler: (message: ForceMessage) => void | Promise<void>,
  ): Promise<void> {
    const pending = this.#prepared.shift()
    if (!pending) throw new Error(`Checkpoint receipt is missing before ${this.domain} Force delivery`)
    try {
      await handler(message)
      await this.waitOutgoingAccepted()
      this.#appliedOrdinal = pending.receipt.sentOrdinal
      this.#appliedAcceptanceSequence = pending.receipt.acceptanceSequence
      pending.resolve()
    } catch (error) {
      pending.reject(error)
      throw error
    }
  }

  private prepare(value: unknown): {ok: true} {
    const receipt = this.receipt(value)
    if (receipt.sentOrdinal !== this.#preparedOrdinal + 1) {
      throw new Error(`Checkpoint delivery ordinal is not contiguous for ${this.domain}`)
    }
    if (this.#deliveries.has(receipt.sentOrdinal)) {
      throw new Error(`Checkpoint delivery ordinal is duplicated for ${this.domain}`)
    }
    const pending = deferred(receipt)
    this.#preparedOrdinal = receipt.sentOrdinal
    this.#prepared.push(pending)
    this.#deliveries.set(receipt.sentOrdinal, pending)
    return {ok: true}
  }

  private async waitApplied(value: unknown): Promise<ForceCheckpointDeliveryReceipt> {
    const receipt = this.receipt(value)
    const pending = this.#deliveries.get(receipt.sentOrdinal)
    if (!pending || JSON.stringify(pending.receipt) !== JSON.stringify(receipt)) {
      throw new Error(`Checkpoint delivery receipt is unknown for ${this.domain}`)
    }
    await pending.applied
    this.#deliveries.delete(receipt.sentOrdinal)
    this.#deliveredOrdinal = receipt.sentOrdinal
    return structuredClone(receipt)
  }

  private async waitOutgoingAccepted(): Promise<void> {
    if (!this.#cutId) throw new Error(`Checkpoint sideband is not open for ${this.domain}`)
    await this.peer.call(
      "dark",
      FORCE_CHECKPOINT_OUTGOING_THROUGH_METHOD,
      {
        cutId: this.#cutId,
        domain: this.domain,
        ordinal: this.#outgoingOrdinal,
      },
      {waitMs: 30_000},
    )
  }

  private async quiesce(): Promise<{ok: true; outgoingOrdinal: number}> {
    let previous = -1
    while (previous !== this.#outgoingOrdinal) {
      previous = this.#outgoingOrdinal
      await this.#drain()
      await this.#quiescence()
      await this.#drain()
      await this.waitOutgoingAccepted()
    }
    return {ok: true, outgoingOrdinal: this.#outgoingOrdinal}
  }

  private receipt(value: unknown): ForceCheckpointDeliveryReceipt {
    const input = record(value)
    if (
      !this.#cutId ||
      !input ||
      !exact(input, ["cutId", "domain", "sentOrdinal", "acceptanceSequence"]) ||
      input.cutId !== this.#cutId ||
      input.domain !== this.domain ||
      !positive(input.sentOrdinal) ||
      !positive(input.acceptanceSequence)
    ) throw new Error(`Checkpoint delivery receipt is invalid for ${this.domain}`)
    return {
      cutId: input.cutId,
      domain: this.domain,
      sentOrdinal: input.sentOrdinal,
      acceptanceSequence: input.acceptanceSequence,
    }
  }
}

export const installForceCheckpointSideband = (
  domain: string,
  peer: CheckpointPeer,
): ForceCheckpointDomainSideband => {
  if (controllers.has(domain)) throw new Error(`Checkpoint sideband is already installed for ${domain}`)
  const controller = new ForceCheckpointDomainSideband(domain, peer)
  controllers.set(domain, controller)
  return controller
}

export const uninstallForceCheckpointSideband = (
  domain: string,
  controller: ForceCheckpointDomainSideband,
): void => {
  if (controllers.get(domain) !== controller) {
    throw new Error(`Checkpoint sideband installation does not match ${domain}`)
  }
  controllers.delete(domain)
}

export const forceCheckpointSideband = (domain: string): ForceCheckpointDomainSideband | null =>
  controllers.get(domain) ?? null
