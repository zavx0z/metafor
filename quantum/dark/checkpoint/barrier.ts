import {forceDomains, type ForceDomain} from "../force/store.ts"

export type CheckpointBarrierPhase = "open" | "settling" | "held"

export interface CheckpointDeliveryReceipt {
  cutId: string
  domain: ForceDomain
  sentOrdinal: number
  acceptanceSequence: number
}

export type CheckpointAppliedAcknowledgement = CheckpointDeliveryReceipt

export interface CheckpointDomainFrontier {
  domain: ForceDomain
  sentOrdinal: number
  appliedOrdinal: number
  appliedAcceptanceSequence: number
}

export interface CheckpointBarrierFrontier {
  cutId: string
  phase: CheckpointBarrierPhase
  acceptanceSequence: number
  domains: CheckpointDomainFrontier[]
}

export interface CheckpointBarrierStateV1 {
  schema: "metafor/checkpoint-barrier-state/v1"
  cutId: string
  acceptanceSequence: number
  domains: Array<{
    domain: ForceDomain
    receipts: CheckpointDeliveryReceipt[]
    appliedOrdinal: number
    appliedAcceptanceSequence: number
  }>
}

export type CheckpointBarrierErrorCode =
  | "invalid_cut_id"
  | "invalid_acceptance_sequence"
  | "invalid_destinations"
  | "invalid_acknowledgement"
  | "acknowledgement_ahead"
  | "sequence_zero_baseline_unresolved"
  | "barrier_in_progress"
  | "barrier_held"
  | "barrier_not_held"
  | "barrier_aborted"
  | "invalid_persisted_state"

export class CheckpointBarrierError extends Error {
  constructor(
    readonly code: CheckpointBarrierErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = "CheckpointBarrierError"
  }
}

interface DomainState {
  readonly receipts: CheckpointDeliveryReceipt[]
  appliedOrdinal: number
  appliedAcceptanceSequence: number
}

interface HoldWaiter {
  resolve(frontier: CheckpointBarrierFrontier): void
  reject(error: CheckpointBarrierError): void
  signal?: AbortSignal
  onAbort?: () => void
}

const cutIdPattern = /^[A-Za-z0-9._-]+$/
const domainSet = new Set<string>(forceDomains)

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const isClosedDataRecord = (
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> => {
  if (!isPlainRecord(value)) return false
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) {
    return false
  }
  return ownKeys.every((key) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
    return descriptor !== undefined && "value" in descriptor && descriptor.enumerable
  })
}

const isPositiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && typeof value === "number" && value > 0

const isForceDomain = (value: unknown): value is ForceDomain =>
  typeof value === "string" && domainSet.has(value)

const cloneReceipt = (receipt: CheckpointDeliveryReceipt): CheckpointDeliveryReceipt => ({...receipt})

/**
 * Transport-neutral checkpoint control-plane model.
 *
 * A caller records one accepted sequence together with its complete
 * destination set, then delivers each returned receipt over the Oracle
 * sideband. A domain may acknowledge a receipt only after it has applied that
 * delivery and all causal output Particles produced by the application have
 * returned to Dark Force acceptance.
 */
export class CheckpointAppliedThroughBarrier {
  readonly cutId: string

  #phase: CheckpointBarrierPhase = "open"
  #acceptanceSequence = 0
  #waiter: HoldWaiter | null = null
  readonly #domains = new Map<ForceDomain, DomainState>(
    forceDomains.map((domain) => [domain, {
      receipts: [],
      appliedOrdinal: 0,
      appliedAcceptanceSequence: 0,
    }]),
  )

  constructor(cutId: string, restored?: CheckpointBarrierStateV1) {
    if (!cutIdPattern.test(cutId)) {
      throw new CheckpointBarrierError(
        "invalid_cut_id",
        "Checkpoint barrier cutId must contain only ASCII letters, digits, '.', '_' or '-'",
      )
    }
    this.cutId = cutId
    if (restored) this.#restore(restored)
  }

  static baseline(cutId: string, acceptanceSequence: number): CheckpointAppliedThroughBarrier {
    if (!Number.isSafeInteger(acceptanceSequence) || acceptanceSequence < 0) {
      throw new CheckpointBarrierError(
        "invalid_persisted_state",
        "Checkpoint baseline sequence must be a non-negative safe integer",
      )
    }
    return new CheckpointAppliedThroughBarrier(cutId, {
      schema: "metafor/checkpoint-barrier-state/v1",
      cutId,
      acceptanceSequence,
      domains: forceDomains.map((domain) => ({
        domain,
        receipts: [],
        appliedOrdinal: 0,
        appliedAcceptanceSequence: 0,
      })),
    })
  }

  get phase(): CheckpointBarrierPhase {
    return this.#phase
  }

  /**
   * Atomically assigns per-domain sent ordinals for one accepted Particle.
   *
   * Recording remains allowed while a hold is settling because an in-flight
   * domain application may causally emit another Particle. The new receipts
   * extend the fixed-point frontier before the hold can resolve.
   */
  recordAccepted(
    acceptanceSequence: number,
    destinations: readonly ForceDomain[],
  ): CheckpointDeliveryReceipt[] {
    if (this.#phase === "held") {
      throw new CheckpointBarrierError(
        "barrier_held",
        "Checkpoint barrier is held; new acceptance is closed until release",
      )
    }
    if (!isPositiveSafeInteger(acceptanceSequence)
      || acceptanceSequence !== this.#acceptanceSequence + 1) {
      throw new CheckpointBarrierError(
        "invalid_acceptance_sequence",
        `Checkpoint acceptance sequence must be exactly ${this.#acceptanceSequence + 1}`,
      )
    }
    if (!Array.isArray(destinations)
      || destinations.some((domain) => !isForceDomain(domain))
      || new Set(destinations).size !== destinations.length) {
      throw new CheckpointBarrierError(
        "invalid_destinations",
        "Checkpoint destinations must be a unique list of canonical Force domains",
      )
    }

    const receipts = destinations.map((domain) => {
      const state = this.#domain(domain)
      return {
        cutId: this.cutId,
        domain,
        sentOrdinal: state.receipts.length + 1,
        acceptanceSequence,
      } satisfies CheckpointDeliveryReceipt
    })

    for (const receipt of receipts) {
      this.#domain(receipt.domain).receipts.push(receipt)
    }
    this.#acceptanceSequence = acceptanceSequence
    this.#tryResolveHold()
    return receipts.map(cloneReceipt)
  }

  /**
   * Advances a domain's applied-through frontier.
   *
   * Acknowledging ordinal N also acknowledges all earlier ordinals because a
   * domain is required to apply its Force input sequentially. Any exact
   * acknowledgement already covered by that frontier is idempotent; an unknown
   * or mismatching receipt is an error.
   */
  acknowledgeApplied(input: unknown): boolean {
    if (this.#phase === "held") {
      throw new CheckpointBarrierError(
        "barrier_held",
        "Checkpoint barrier is held; acknowledgements cannot change the captured frontier",
      )
    }
    const acknowledgement = this.#acknowledgement(input)
    const state = this.#domain(acknowledgement.domain)
    if (acknowledgement.sentOrdinal > state.receipts.length) {
      throw new CheckpointBarrierError(
        "acknowledgement_ahead",
        `Checkpoint acknowledgement is ahead of ${acknowledgement.domain}'s sent frontier`,
      )
    }
    const receipt = state.receipts[acknowledgement.sentOrdinal - 1]!
    if (receipt.acceptanceSequence !== acknowledgement.acceptanceSequence) {
      throw new CheckpointBarrierError(
        "invalid_acknowledgement",
        "Checkpoint acknowledgement does not match its recorded delivery receipt",
      )
    }
    if (acknowledgement.sentOrdinal <= state.appliedOrdinal) {
      if (acknowledgement.sentOrdinal < state.appliedOrdinal) return false
      if (acknowledgement.acceptanceSequence !== state.appliedAcceptanceSequence) {
        throw new CheckpointBarrierError(
          "invalid_acknowledgement",
          "Checkpoint duplicate acknowledgement does not match the applied frontier",
        )
      }
      return false
    }

    state.appliedOrdinal = acknowledgement.sentOrdinal
    state.appliedAcceptanceSequence = acknowledgement.acceptanceSequence
    this.#tryResolveHold()
    return true
  }

  /**
   * Waits for the causal fixed point after external admission is closed.
   *
   * This method deliberately refuses sequence 0. The live Universe predates
   * this receipt tracker, so an empty tracker cannot prove that an existing
   * Boundary/Mass state is an applied-through baseline.
   */
  holdUnderClosedAdmission(signal?: AbortSignal): Promise<CheckpointBarrierFrontier> {
    if (this.#acceptanceSequence === 0) {
      return Promise.reject(new CheckpointBarrierError(
        "sequence_zero_baseline_unresolved",
        "Checkpoint sequence 0 cannot establish an applied-through live baseline",
      ))
    }
    if (this.#phase === "settling") {
      return Promise.reject(new CheckpointBarrierError(
        "barrier_in_progress",
        "Checkpoint barrier is already settling",
      ))
    }
    if (this.#phase === "held") {
      return Promise.reject(new CheckpointBarrierError(
        "barrier_held",
        "Checkpoint barrier is already held",
      ))
    }
    if (signal?.aborted) {
      return Promise.reject(new CheckpointBarrierError(
        "barrier_aborted",
        "Checkpoint barrier was aborted before settling",
      ))
    }

    this.#phase = "settling"
    const promise = new Promise<CheckpointBarrierFrontier>((resolve, reject) => {
      const waiter: HoldWaiter = {resolve, reject, ...(signal ? {signal} : {})}
      if (signal) {
        waiter.onAbort = () => {
          if (this.#waiter !== waiter) return
          this.#waiter = null
          this.#phase = "open"
          reject(new CheckpointBarrierError("barrier_aborted", "Checkpoint barrier was aborted"))
        }
        signal.addEventListener("abort", waiter.onAbort, {once: true})
      }
      this.#waiter = waiter
    })
    this.#tryResolveHold()
    return promise
  }

  release(): void {
    if (this.#phase !== "held") {
      throw new CheckpointBarrierError(
        "barrier_not_held",
        "Checkpoint barrier can be released only after it is held",
      )
    }
    this.#phase = "open"
  }

  frontier(): CheckpointBarrierFrontier {
    return {
      cutId: this.cutId,
      phase: this.#phase,
      acceptanceSequence: this.#acceptanceSequence,
      domains: forceDomains.map((domain) => {
        const state = this.#domain(domain)
        return {
          domain,
          sentOrdinal: state.receipts.length,
          appliedOrdinal: state.appliedOrdinal,
          appliedAcceptanceSequence: state.appliedAcceptanceSequence,
        }
      }),
    }
  }

  state(): CheckpointBarrierStateV1 {
    return {
      schema: "metafor/checkpoint-barrier-state/v1",
      cutId: this.cutId,
      acceptanceSequence: this.#acceptanceSequence,
      domains: forceDomains.map((domain) => {
        const state = this.#domain(domain)
        return {
          domain,
          receipts: state.receipts.map(cloneReceipt),
          appliedOrdinal: state.appliedOrdinal,
          appliedAcceptanceSequence: state.appliedAcceptanceSequence,
        }
      }),
    }
  }

  #domain(domain: ForceDomain): DomainState {
    return this.#domains.get(domain)!
  }

  #restore(input: CheckpointBarrierStateV1): void {
    const invalid = (): never => {
      throw new CheckpointBarrierError(
        "invalid_persisted_state",
        "Checkpoint persisted barrier state is invalid",
      )
    }
    if (
      !isClosedDataRecord(input, ["schema", "cutId", "acceptanceSequence", "domains"]) ||
      input.schema !== "metafor/checkpoint-barrier-state/v1" ||
      input.cutId !== this.cutId ||
      !Number.isSafeInteger(input.acceptanceSequence) ||
      input.acceptanceSequence < 0 ||
      !Array.isArray(input.domains) ||
      input.domains.length !== forceDomains.length
    ) invalid()

    const seen = new Set<ForceDomain>()
    for (const value of input.domains) {
      if (
        !isClosedDataRecord(value, [
          "domain",
          "receipts",
          "appliedOrdinal",
          "appliedAcceptanceSequence",
        ]) ||
        !isForceDomain(value.domain) ||
        seen.has(value.domain) ||
        !Array.isArray(value.receipts) ||
        !Number.isSafeInteger(value.appliedOrdinal) ||
        value.appliedOrdinal < 0 ||
        value.appliedOrdinal > value.receipts.length ||
        !Number.isSafeInteger(value.appliedAcceptanceSequence) ||
        value.appliedAcceptanceSequence < 0
      ) invalid()
      seen.add(value.domain)
      const receipts = value.receipts.map((receipt, index) => {
        if (
          !isClosedDataRecord(receipt, ["cutId", "domain", "sentOrdinal", "acceptanceSequence"]) ||
          receipt.cutId !== this.cutId ||
          receipt.domain !== value.domain ||
          receipt.sentOrdinal !== index + 1 ||
          !isPositiveSafeInteger(receipt.acceptanceSequence) ||
          receipt.acceptanceSequence > input.acceptanceSequence
        ) invalid()
        return {
          cutId: this.cutId,
          domain: value.domain,
          sentOrdinal: receipt.sentOrdinal,
          acceptanceSequence: receipt.acceptanceSequence,
        }
      })
      const expectedApplied = value.appliedOrdinal === 0
        ? 0
        : receipts[value.appliedOrdinal - 1]!.acceptanceSequence
      if (value.appliedAcceptanceSequence !== expectedApplied) invalid()
      const target = this.#domain(value.domain)
      target.receipts.push(...receipts)
      target.appliedOrdinal = value.appliedOrdinal
      target.appliedAcceptanceSequence = value.appliedAcceptanceSequence
    }
    if (seen.size !== forceDomains.length) invalid()
    this.#acceptanceSequence = input.acceptanceSequence
  }

  #acknowledgement(input: unknown): CheckpointAppliedAcknowledgement {
    if (!isClosedDataRecord(input, ["cutId", "domain", "sentOrdinal", "acceptanceSequence"])
      || input.cutId !== this.cutId
      || !isForceDomain(input.domain)
      || !isPositiveSafeInteger(input.sentOrdinal)
      || !isPositiveSafeInteger(input.acceptanceSequence)) {
      throw new CheckpointBarrierError(
        "invalid_acknowledgement",
        "Checkpoint applied acknowledgement must be a closed, matching delivery receipt",
      )
    }
    return {
      cutId: this.cutId,
      domain: input.domain,
      sentOrdinal: input.sentOrdinal,
      acceptanceSequence: input.acceptanceSequence,
    }
  }

  #tryResolveHold(): void {
    if (this.#phase !== "settling" || !this.#waiter) return
    const settled = forceDomains.every((domain) => {
      const state = this.#domain(domain)
      return state.appliedOrdinal === state.receipts.length
    })
    if (!settled) return

    const waiter = this.#waiter
    this.#waiter = null
    this.#phase = "held"
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener("abort", waiter.onAbort)
    }
    waiter.resolve(this.frontier())
  }
}
