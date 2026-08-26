/**
Matrix-local routing of Boundary-resolved Reaction relations and durable work.

Matrix emits one enqueue request for every match before it finishes handling a
confirmed State. Boundary persists and orders those requests, then publishes
queue commits back to Matrix. Matrix alone advances the exact durable FIFO head;
no current or historical source State is inferred during cold birth.

@packageDocumentation
*/

import type {BoundaryInitialReactionExecution} from "shared/protocol/boundary/initial"
import {
  REACTION_RECOVERY_KIND,
  REACTION_START_KIND,
  REACTION_TRIGGER_KIND,
  type ReactionMatrixRequest,
  type ReactionQueueCommit,
  type ReactionRecoveryRequest,
  type ReactionRelation,
  type ReactionResultCommit,
  type ReactionStartRequest,
  type ReactionStateCommit,
  type ReactionTriggerRequest,
} from "shared/protocol/force/reaction"

export type MatrixReactionRouterOptions = {
  currentStateId(atomId: number): number | null
  currentWimp(atomId: number): string | null
  emit(request: ReactionMatrixRequest): void
  executionId?: () => string
}

const sourceStateKey = (atomId: number, stateId: number): string => `${atomId}\0${stateId}`

const addIndex = (index: Map<string, Set<string>>, key: string, relationKey: string): void => {
  const values = index.get(key)
  if (values) values.add(relationKey)
  else index.set(key, new Set([relationKey]))
}

const removeIndex = (index: Map<string, Set<string>>, key: string, relationKey: string): void => {
  const values = index.get(key)
  if (!values) return
  values.delete(relationKey)
  if (values.size === 0) index.delete(key)
}

const sameQueueEntry = (left: ReactionQueueCommit, right: ReactionQueueCommit): boolean =>
  left.queueOrder === right.queueOrder && left.status === right.status &&
  JSON.stringify(left.request) === JSON.stringify(right.request)

/** Exact Reaction adjacency and one Boundary-backed FIFO lane per target Atom. */
export class MatrixReactionRouter {
  readonly #relations = new Map<string, ReactionRelation>()
  readonly #relationKeysBySourceState = new Map<string, Set<string>>()
  readonly #relationKeysByTargetAtom = new Map<number, Set<string>>()
  readonly #queueByTargetAtom = new Map<number, ReactionQueueCommit[]>()
  readonly #pendingByTargetAtom = new Map<number, ReactionQueueCommit>()
  readonly #entryByExecutionId = new Map<string, ReactionQueueCommit>()
  readonly #startingByTargetAtom = new Map<number, string>()
  readonly #recoveringExecutionIds = new Set<string>()
  readonly #seenEventIds = new Set<string>()
  readonly #confirmedStateIdByAtom = new Map<number, number>()
  readonly #currentStateId: MatrixReactionRouterOptions["currentStateId"]
  readonly #currentWimp: MatrixReactionRouterOptions["currentWimp"]
  readonly #emit: MatrixReactionRouterOptions["emit"]
  readonly #executionId: () => string

  constructor(options: MatrixReactionRouterOptions) {
    this.#currentStateId = options.currentStateId
    this.#currentWimp = options.currentWimp
    this.#emit = options.emit
    this.#executionId = options.executionId ?? (() => crypto.randomUUID())
  }

  /**
  Hydrates exact relations, confirmed States and unfinished Boundary queue rows.

  This method emits nothing. The new runtime calls {@link resumeColdStart} only
  after its Force channel exists, so accepted-but-not-applied recovery messages
  keep their causal order ahead of new control requests.
  */
  hydrate(
    relations: readonly ReactionRelation[],
    confirmedStates: readonly (readonly [number, number | null])[] = [],
    executions: readonly BoundaryInitialReactionExecution[] = [],
  ): void {
    this.clear()
    for (const [atomId, stateId] of confirmedStates) {
      if (stateId !== null) this.#confirmedStateIdByAtom.set(atomId, stateId)
    }
    for (const relation of relations) this.upsert(relation)
    for (const execution of [...executions].sort((left, right) =>
      left.queue.request.targetAtomId - right.queue.request.targetAtomId ||
      left.queue.queueOrder - right.queue.queueOrder ||
      left.queue.request.reactionExecutionId.localeCompare(right.queue.request.reactionExecutionId))) {
      this.#remember(execution.queue)
    }
    for (const [targetAtomId, pending] of this.#pendingByTargetAtom) {
      const earlier = this.#queueByTargetAtom.get(targetAtomId)?.[0]
      if (earlier && earlier.queueOrder < pending.queueOrder) {
        throw new Error(`Boundary pending Reaction is not FIFO head for Atom ${targetAtomId}`)
      }
    }
  }

  /** Emits one recovery or start request per unfinished target lane after cold birth. */
  resumeColdStart(): ReactionMatrixRequest[] {
    const emitted: ReactionMatrixRequest[] = []
    const targetAtomIds = new Set([
      ...this.#pendingByTargetAtom.keys(),
      ...this.#queueByTargetAtom.keys(),
    ])
    for (const targetAtomId of [...targetAtomIds].sort((left, right) => left - right)) {
      const pending = this.#pendingByTargetAtom.get(targetAtomId)
      if (pending) {
        const executionId = pending.request.reactionExecutionId
        if (this.#recoveringExecutionIds.has(executionId)) continue
        const request = this.#recoveryRequest(pending)
        this.#recoveringExecutionIds.add(executionId)
        this.#emit(request)
        emitted.push(request)
        continue
      }
      const request = this.#startHead(targetAtomId)
      if (request) emitted.push(request)
    }
    return emitted
  }

  upsert(relation: ReactionRelation): void {
    const previous = this.#relations.get(relation.key)
    if (previous) this.#unindex(previous)
    const next = structuredClone(relation)
    this.#relations.set(next.key, next)
    this.#index(next)
  }

  remove(relationKey: string): void {
    const relation = this.#relations.get(relationKey)
    if (!relation) return
    this.#unindex(relation)
    this.#relations.delete(relationKey)
    const queue = this.#queueByTargetAtom.get(relation.target.atomId)
    for (const entry of queue?.filter((queued) => queued.request.relationKey === relationKey) ?? []) {
      this.#forget(entry)
    }
  }

  /** Routes only a Boundary-confirmed new State and durably enqueues every match. */
  confirmState(event: ReactionStateCommit, timestamp: number): ReactionTriggerRequest[] {
    if (this.#seenEventIds.has(event.eventId)) return []
    const current = this.#currentStateId(event.atomId)
    if (current !== event.stateId || this.#currentWimp(event.atomId) !== event.wimp) {
      throw new Error(`Matrix confirmed State ${event.stateId} does not match Atom ${event.atomId} current State`)
    }
    this.#confirmedStateIdByAtom.set(event.atomId, event.stateId)
    this.#dropInactiveTargetWork(event.atomId)

    const emitted: ReactionTriggerRequest[] = []
    const keys = [...(this.#relationKeysBySourceState.get(sourceStateKey(event.atomId, event.stateId)) ?? [])]
      .sort((left, right) => {
        const leftRelation = this.#relations.get(left)
        const rightRelation = this.#relations.get(right)
        return (leftRelation?.reactionId ?? 0) - (rightRelation?.reactionId ?? 0) || left.localeCompare(right)
      })
    for (const relationKey of keys) {
      const relation = this.#relations.get(relationKey)
      if (!relation || !this.#active(relation)) continue
      const request: ReactionTriggerRequest = {
        kind: REACTION_TRIGGER_KIND,
        reactionExecutionId: this.#executionId(),
        relationKey: relation.key,
        reactionId: relation.reactionId,
        eventId: event.eventId,
        targetAtomId: relation.target.atomId,
        source: {
          atomId: event.atomId,
          wimp: event.wimp,
          stateId: event.stateId,
          state: event.state,
        },
        timestamp,
      }
      this.#emit(request)
      emitted.push(request)
    }
    this.#seenEventIds.add(event.eventId)
    return emitted
  }

  /** Applies one Boundary queue acknowledgement and starts only an idle durable head. */
  confirmQueue(commit: ReactionQueueCommit): ReactionStartRequest | null {
    this.#remember(commit)
    return commit.status === "queued" ? this.#startHead(commit.request.targetAtomId) : null
  }

  /** Releases one durable entry after Boundary publishes its terminal copy. */
  settle(commit: ReactionResultCommit): ReactionStartRequest | null {
    const entry = this.#entryByExecutionId.get(commit.reactionExecutionId)
    if (!entry) return null
    if (entry.request.relationKey !== commit.relationKey || entry.request.reactionId !== commit.reactionId) {
      throw new Error(`Reaction result ${commit.reactionExecutionId} does not match Matrix queue entry`)
    }
    const targetAtomId = entry.request.targetAtomId
    this.#forget(entry)
    this.#recoveringExecutionIds.delete(commit.reactionExecutionId)
    if (this.#startingByTargetAtom.get(targetAtomId) === commit.reactionExecutionId) {
      this.#startingByTargetAtom.delete(targetAtomId)
    }
    return this.#pendingByTargetAtom.has(targetAtomId) ? null : this.#startHead(targetAtomId)
  }

  /** Removes all adjacency and unfinished work involving a retired Atom. */
  removeAtom(atomId: number): void {
    const relationKeys = [...this.#relations.values()]
      .filter((relation) => relation.source.atomId === atomId || relation.target.atomId === atomId)
      .map((relation) => relation.key)
    for (const relationKey of relationKeys) this.remove(relationKey)
    this.#dropTargetWork(atomId)
    this.#confirmedStateIdByAtom.delete(atomId)
  }

  clear(): void {
    this.#relations.clear()
    this.#relationKeysBySourceState.clear()
    this.#relationKeysByTargetAtom.clear()
    this.#queueByTargetAtom.clear()
    this.#pendingByTargetAtom.clear()
    this.#entryByExecutionId.clear()
    this.#startingByTargetAtom.clear()
    this.#recoveringExecutionIds.clear()
    this.#seenEventIds.clear()
    this.#confirmedStateIdByAtom.clear()
  }

  pending(targetAtomId: number): string | null {
    return this.#pendingByTargetAtom.get(targetAtomId)?.request.reactionExecutionId ?? null
  }

  queued(targetAtomId: number): number {
    return this.#queueByTargetAtom.get(targetAtomId)?.length ?? 0
  }

  #remember(commit: ReactionQueueCommit): void {
    const request = commit.request
    const relation = this.#relations.get(request.relationKey)
    if (!relation || relation.reactionId !== request.reactionId ||
        relation.target.atomId !== request.targetAtomId ||
        relation.source.atomId !== request.source.atomId || relation.source.wimp !== request.source.wimp ||
        !relation.source.states.some((state) => state.id === request.source.stateId && state.name === request.source.state)) {
      throw new Error(`Boundary Reaction queue entry ${request.reactionExecutionId} does not match its relation`)
    }
    const existing = this.#entryByExecutionId.get(request.reactionExecutionId)
    if (existing) {
      if (sameQueueEntry(existing, commit)) return
      if (existing.status !== "queued" || commit.status !== "pending" ||
          existing.queueOrder !== commit.queueOrder || JSON.stringify(existing.request) !== JSON.stringify(request)) {
        throw new Error(`Boundary Reaction queue identity collision: ${request.reactionExecutionId}`)
      }
      this.#forget(existing)
    }

    const targetAtomId = request.targetAtomId
    const candidates = [...(this.#queueByTargetAtom.get(targetAtomId) ?? [])]
    const pending = this.#pendingByTargetAtom.get(targetAtomId)
    if (pending) candidates.push(pending)
    if (candidates.some((entry) => entry.queueOrder === commit.queueOrder)) {
      throw new Error(`Boundary Reaction queue order ${commit.queueOrder} is duplicated for Atom ${targetAtomId}`)
    }
    const stored = structuredClone(commit)
    this.#entryByExecutionId.set(request.reactionExecutionId, stored)
    this.#seenEventIds.add(request.eventId)
    if (stored.status === "pending") {
      if (pending) throw new Error(`Boundary returned multiple pending Reactions for Atom ${targetAtomId}`)
      this.#pendingByTargetAtom.set(targetAtomId, stored)
      this.#startingByTargetAtom.delete(targetAtomId)
      this.#recoveringExecutionIds.delete(request.reactionExecutionId)
    } else {
      const queue = this.#queueByTargetAtom.get(targetAtomId)
      if (queue) queue.push(stored)
      else this.#queueByTargetAtom.set(targetAtomId, [stored])
      this.#queueByTargetAtom.get(targetAtomId)!.sort((left, right) =>
        left.queueOrder - right.queueOrder ||
        left.request.reactionExecutionId.localeCompare(right.request.reactionExecutionId))
    }
  }

  #forget(entry: ReactionQueueCommit): void {
    const executionId = entry.request.reactionExecutionId
    const targetAtomId = entry.request.targetAtomId
    if (this.#pendingByTargetAtom.get(targetAtomId)?.request.reactionExecutionId === executionId) {
      this.#pendingByTargetAtom.delete(targetAtomId)
    }
    const queue = this.#queueByTargetAtom.get(targetAtomId)
    if (queue) {
      const remaining = queue.filter((queued) => queued.request.reactionExecutionId !== executionId)
      if (remaining.length > 0) this.#queueByTargetAtom.set(targetAtomId, remaining)
      else this.#queueByTargetAtom.delete(targetAtomId)
    }
    this.#entryByExecutionId.delete(executionId)
    this.#recoveringExecutionIds.delete(executionId)
    if (this.#startingByTargetAtom.get(targetAtomId) === executionId) {
      this.#startingByTargetAtom.delete(targetAtomId)
    }
  }

  #index(relation: ReactionRelation): void {
    for (const state of relation.source.states) {
      addIndex(this.#relationKeysBySourceState, sourceStateKey(relation.source.atomId, state.id), relation.key)
    }
    const targets = this.#relationKeysByTargetAtom.get(relation.target.atomId)
    if (targets) targets.add(relation.key)
    else this.#relationKeysByTargetAtom.set(relation.target.atomId, new Set([relation.key]))
  }

  #unindex(relation: ReactionRelation): void {
    for (const state of relation.source.states) {
      removeIndex(this.#relationKeysBySourceState, sourceStateKey(relation.source.atomId, state.id), relation.key)
    }
    const targets = this.#relationKeysByTargetAtom.get(relation.target.atomId)
    targets?.delete(relation.key)
    if (targets?.size === 0) this.#relationKeysByTargetAtom.delete(relation.target.atomId)
  }

  #active(relation: ReactionRelation): boolean {
    const confirmedStateId = this.#confirmedStateIdByAtom.get(relation.target.atomId) ?? null
    const currentStateId = this.#currentStateId(relation.target.atomId)
    return this.#currentWimp(relation.target.atomId) === relation.target.wimp &&
      confirmedStateId !== null && relation.target.stateIds.includes(confirmedStateId) &&
      currentStateId !== null && relation.target.stateIds.includes(currentStateId)
  }

  #dropInactiveTargetWork(atomId: number): void {
    const pending = this.#pendingByTargetAtom.get(atomId)
    const pendingRelation = pending ? this.#relations.get(pending.request.relationKey) : undefined
    if (pending && (!pendingRelation || !this.#active(pendingRelation))) this.#forget(pending)
    for (const entry of [...(this.#queueByTargetAtom.get(atomId) ?? [])]) {
      const relation = this.#relations.get(entry.request.relationKey)
      if (!relation || !this.#active(relation)) this.#forget(entry)
    }
    this.#startingByTargetAtom.delete(atomId)
  }

  #dropTargetWork(atomId: number): void {
    const pending = this.#pendingByTargetAtom.get(atomId)
    if (pending) this.#forget(pending)
    for (const entry of [...(this.#queueByTargetAtom.get(atomId) ?? [])]) this.#forget(entry)
    this.#startingByTargetAtom.delete(atomId)
  }

  #startHead(targetAtomId: number): ReactionStartRequest | null {
    if (this.#pendingByTargetAtom.has(targetAtomId) || this.#startingByTargetAtom.has(targetAtomId)) return null
    const head = this.#queueByTargetAtom.get(targetAtomId)?.[0]
    if (!head) return null
    const relation = this.#relations.get(head.request.relationKey)
    if (!relation || !this.#active(relation)) return null
    const request: ReactionStartRequest = {
      kind: REACTION_START_KIND,
      reactionExecutionId: head.request.reactionExecutionId,
      relationKey: head.request.relationKey,
      reactionId: head.request.reactionId,
      targetAtomId,
    }
    this.#startingByTargetAtom.set(targetAtomId, request.reactionExecutionId)
    this.#emit(request)
    return request
  }

  #recoveryRequest(entry: ReactionQueueCommit): ReactionRecoveryRequest {
    return {
      kind: REACTION_RECOVERY_KIND,
      reactionExecutionId: entry.request.reactionExecutionId,
      relationKey: entry.request.relationKey,
      reactionId: entry.request.reactionId,
      targetAtomId: entry.request.targetAtomId,
    }
  }
}
