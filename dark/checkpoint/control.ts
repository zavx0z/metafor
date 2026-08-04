import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs"
import {dirname, join, resolve} from "node:path"
import type {MonadRpcPeer} from "shared/transport/monad"
import {
  FORCE_CHECKPOINT_OUTGOING_THROUGH_METHOD,
  FORCE_CHECKPOINT_PREPARE_METHOD,
  FORCE_CHECKPOINT_QUIESCE_METHOD,
  FORCE_CHECKPOINT_SESSION_METHOD,
  FORCE_CHECKPOINT_WAIT_APPLIED_METHOD,
  type CheckpointForceDomain,
  type ForceCheckpointDeliveryReceipt,
  type ForceCheckpointSession,
} from "shared/transport/force/checkpoint"
import {
  CheckpointAppliedThroughBarrier,
  type CheckpointBarrierFrontier,
  type CheckpointBarrierStateV1,
  type CheckpointDeliveryReceipt,
} from "./barrier.ts"
import {forceDomains, type ForceDomain} from "../force/store.ts"

export const CHECKPOINT_CONTROL_STATE_SCHEMA = "metafor/checkpoint-control-state/v1" as const

export type CheckpointControlStateV1 = {
  schema: typeof CHECKPOINT_CONTROL_STATE_SCHEMA
  barrier: CheckpointBarrierStateV1
  acceptedOutgoing: Array<{
    domain: ForceDomain
    ordinal: number
  }>
}
type HistoryStatus = {
  cutId: string
  sequence: number
}

type CheckpointControlPeer = Pick<MonadRpcPeer, "call" | "expose">

type OutgoingWaiter = {
  ordinal: number
  resolve(): void
}

const domains = new Set<string>(forceDomains)

const isDomain = (value: unknown): value is ForceDomain =>
  typeof value === "string" && domains.has(value)

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

const nonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0

const durableJSON = (filename: string, value: unknown, exclusive = false): void => {
  const directory = dirname(filename)
  mkdirSync(directory, {recursive: true, mode: 0o700})
  const temporary = join(directory, `.state.${process.pid}.${crypto.randomUUID()}.tmp`)
  const descriptor = openSync(temporary, exclusive ? "wx" : "w", 0o600)
  try {
    writeSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, undefined, "utf8")
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  try {
    if (exclusive && existsSync(filename)) throw new Error(`Checkpoint control state already exists: ${filename}`)
    renameSync(temporary, filename)
    const parent = openSync(directory, "r")
    try {
      fsyncSync(parent)
    } finally {
      closeSync(parent)
    }
  } finally {
    if (existsSync(temporary)) rmSync(temporary)
  }
}

const parseState = (value: unknown): CheckpointControlStateV1 => {
  const input = record(value)
  if (
    !input ||
    !exact(input, ["schema", "barrier", "acceptedOutgoing"]) ||
    input.schema !== CHECKPOINT_CONTROL_STATE_SCHEMA ||
    !Array.isArray(input.acceptedOutgoing)
  ) throw new Error("Checkpoint control state is invalid")
  const barrierInput = input.barrier as CheckpointBarrierStateV1
  const barrier = new CheckpointAppliedThroughBarrier(
    typeof barrierInput?.cutId === "string" ? barrierInput.cutId : "",
    barrierInput,
  )
  const accepted = input.acceptedOutgoing.map((value) => {
    const entry = record(value)
    if (
      !entry ||
      !exact(entry, ["domain", "ordinal"]) ||
      !isDomain(entry.domain) ||
      !nonNegative(entry.ordinal)
    ) throw new Error("Checkpoint control outgoing frontier is invalid")
    return {domain: entry.domain, ordinal: entry.ordinal}
  })
  if (
    accepted.length !== forceDomains.length ||
    new Set(accepted.map(({domain}) => domain)).size !== forceDomains.length
  ) throw new Error("Checkpoint control outgoing frontier is incomplete")
  return {
    schema: CHECKPOINT_CONTROL_STATE_SCHEMA,
    barrier: barrier.state(),
    acceptedOutgoing: forceDomains.map((domain) => ({
      domain,
      ordinal: accepted.find((entry) => entry.domain === domain)!.ordinal,
    })),
  }
}

export const readCheckpointControlState = (
  filename: string,
): CheckpointControlStateV1 => {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(filename, "utf8")) as unknown
  } catch (error) {
    throw new Error(`Checkpoint control state cannot be read: ${filename}`, {cause: error})
  }
  return parseState(value)
}

export const checkpointControlStatePath = (repositoryState: string): string =>
  resolve(repositoryState, "checkpoint-control", "v1", "state.json")

export const initializeCheckpointControlBaseline = (
  filename: string,
  cutId: string,
  acceptanceSequence: number,
): CheckpointControlStateV1 => {
  const state: CheckpointControlStateV1 = {
    schema: CHECKPOINT_CONTROL_STATE_SCHEMA,
    barrier: CheckpointAppliedThroughBarrier.baseline(cutId, acceptanceSequence).state(),
    acceptedOutgoing: forceDomains.map((domain) => ({domain, ordinal: 0})),
  }
  if (existsSync(filename)) {
    const current = readCheckpointControlState(filename)
    if (JSON.stringify(current) !== JSON.stringify(state)) {
      throw new Error("Checkpoint control baseline already exists with different content")
    }
    return current
  }
  durableJSON(filename, state, true)
  return structuredClone(state)
}

/**
 * Dark-owned receipt coordinator.
 *
 * Its file is control-plane recovery state only. It contains no Particle or
 * snapshot data. History acceptance and this state are both durable before
 * routing. Unacknowledged deliveries remain exact receipts that startup can
 * replay from the matching immutable Force history entry.
 */
export class DarkCheckpointControl {
  readonly filename: string
  readonly cutId: string
  readonly barrier: CheckpointAppliedThroughBarrier
  readonly #acceptedOutgoing = new Map<ForceDomain, number>()
  readonly #waiters = new Map<ForceDomain, OutgoingWaiter[]>(
    forceDomains.map((domain) => [domain, []]),
  )

  constructor(
    filename: string,
    history: HistoryStatus,
    private readonly peer: CheckpointControlPeer,
  ) {
    this.filename = resolve(filename)
    if (!existsSync(this.filename)) {
      if (history.sequence !== 0) {
        throw new Error("Checkpoint control baseline is missing for a non-empty Dark Force history")
      }
      initializeCheckpointControlBaseline(this.filename, history.cutId, 0)
    }
    const state = readCheckpointControlState(this.filename)
    if (
      state.barrier.cutId !== history.cutId ||
      state.barrier.acceptanceSequence !== history.sequence
    ) throw new Error("Checkpoint control state does not match Dark Force history")
    this.cutId = history.cutId
    this.barrier = new CheckpointAppliedThroughBarrier(this.cutId, state.barrier)
    for (const entry of state.acceptedOutgoing) this.#acceptedOutgoing.set(entry.domain, entry.ordinal)

    peer.expose(FORCE_CHECKPOINT_SESSION_METHOD, async (input) => this.session(input))
    peer.expose(FORCE_CHECKPOINT_OUTGOING_THROUGH_METHOD, async (input) => await this.outgoingThrough(input))
  }

  recordAccepted(
    acceptanceSequence: number,
    destinations: readonly ForceDomain[],
  ): CheckpointDeliveryReceipt[] {
    const receipts = this.barrier.recordAccepted(acceptanceSequence, destinations)
    this.persist()
    return receipts
  }

  pendingDeliveries(): CheckpointDeliveryReceipt[] {
    return this.barrier.state().domains.flatMap((domain) =>
      domain.receipts.slice(domain.appliedOrdinal).map((receipt) => structuredClone(receipt))
    ).toSorted((left, right) =>
      left.acceptanceSequence - right.acceptanceSequence ||
      forceDomains.indexOf(left.domain) - forceDomains.indexOf(right.domain)
    )
  }

  async prepare(receipts: readonly CheckpointDeliveryReceipt[]): Promise<void> {
    await Promise.all(receipts.map(async (receipt) => {
      await this.peer.call(
        receipt.domain,
        FORCE_CHECKPOINT_PREPARE_METHOD,
        receipt,
        {waitMs: 30_000},
      )
    }))
  }

  async waitApplied(receipts: readonly CheckpointDeliveryReceipt[]): Promise<void> {
    await Promise.all(receipts.map(async (receipt) => {
      const acknowledgement = await this.peer.call<ForceCheckpointDeliveryReceipt>(
        receipt.domain,
        FORCE_CHECKPOINT_WAIT_APPLIED_METHOD,
        receipt,
        {waitMs: 30_000},
      )
      this.barrier.acknowledgeApplied(acknowledgement)
      this.persist()
    }))
  }

  acceptedFrom(domain: ForceDomain): void {
    const ordinal = (this.#acceptedOutgoing.get(domain) ?? 0) + 1
    this.#acceptedOutgoing.set(domain, ordinal)
    this.persist()
    const waiters = this.#waiters.get(domain)!
    for (const waiter of waiters.splice(0)) {
      if (waiter.ordinal <= ordinal) waiter.resolve()
      else waiters.push(waiter)
    }
  }

  /**
   * Quiesces every domain and holds the exact current applied-through frontier.
   *
   * The caller must close external Force admission before invoking this method.
   * Domain causal output remains accepted while quiescence settles.
   */
  async holdUnderClosedAdmission(
    signal?: AbortSignal,
  ): Promise<CheckpointBarrierFrontier> {
    if (this.barrier.phase === "held") return this.barrier.frontier()
    await Promise.all(forceDomains.map(async (domain) => {
      await this.peer.call(
        domain,
        FORCE_CHECKPOINT_QUIESCE_METHOD,
        {},
        {waitMs: 30_000},
      )
    }))
    const frontier = await this.barrier.holdUnderClosedAdmission(signal)
    this.persist()
    return frontier
  }

  releaseAdmissionHold(): CheckpointBarrierFrontier {
    this.barrier.release()
    this.persist()
    return this.barrier.frontier()
  }

  state(): CheckpointControlStateV1 {
    return {
      schema: CHECKPOINT_CONTROL_STATE_SCHEMA,
      barrier: this.barrier.state(),
      acceptedOutgoing: forceDomains.map((domain) => ({
        domain,
        ordinal: this.#acceptedOutgoing.get(domain) ?? 0,
      })),
    }
  }

  private session(value: unknown): ForceCheckpointSession {
    const input = record(value)
    if (!input || !exact(input, ["domain"]) || !isDomain(input.domain)) {
      throw new Error("Checkpoint session request is invalid")
    }
    const frontier = this.barrier.frontier().domains.find(({domain}) => domain === input.domain)!
    return {
      cutId: this.cutId,
      domain: input.domain as CheckpointForceDomain,
      deliveredOrdinal: frontier.appliedOrdinal,
      acceptedOutgoingOrdinal: this.#acceptedOutgoing.get(input.domain) ?? 0,
    }
  }

  private async outgoingThrough(value: unknown): Promise<{ok: true; ordinal: number}> {
    const input = record(value)
    if (
      !input ||
      !exact(input, ["cutId", "domain", "ordinal"]) ||
      input.cutId !== this.cutId ||
      !isDomain(input.domain) ||
      !nonNegative(input.ordinal)
    ) throw new Error("Checkpoint outgoing acceptance request is invalid")
    const current = this.#acceptedOutgoing.get(input.domain) ?? 0
    if (input.ordinal > current) {
      await new Promise<void>((resolve) => {
        this.#waiters.get(input.domain as ForceDomain)!.push({ordinal: input.ordinal as number, resolve})
      })
    }
    return {ok: true, ordinal: input.ordinal}
  }

  private persist(): void {
    durableJSON(this.filename, this.state())
  }
}
