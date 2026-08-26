/**
Matrix-local routing of Boundary-resolved Reaction relations.

Potential relations are canonical Boundary facts. Matrix derives only their
current activity from the target Atom State, routes each confirmed source State
once, and serializes executions per target Atom.

@packageDocumentation
*/

import {
  REACTION_TRIGGER_KIND,
  type ReactionRelation,
  type ReactionResultCommit,
  type ReactionStateCommit,
  type ReactionTriggerRequest,
} from "shared/protocol/force/reaction"

type QueuedReaction = {
  relationKey: string
  event: ReactionStateCommit
  timestamp: number
}

type PendingReaction = {
  relationKey: string
  reactionId: number
  reactionExecutionId: string
}

export type MatrixReactionRouterOptions = {
  currentStateId(atomId: number): number | null
  currentWimp(atomId: number): string | null
  emit(request: ReactionTriggerRequest): void
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

/** Exact Reaction adjacency and one FIFO execution lane per target Atom. */
export class MatrixReactionRouter {
  readonly #relations = new Map<string, ReactionRelation>()
  readonly #relationKeysBySourceState = new Map<string, Set<string>>()
  readonly #relationKeysByTargetAtom = new Map<number, Set<string>>()
  readonly #queueByTargetAtom = new Map<number, QueuedReaction[]>()
  readonly #pendingByTargetAtom = new Map<number, PendingReaction>()
  readonly #targetAtomByExecutionId = new Map<string, number>()
  readonly #lastEventIdBySourceAtom = new Map<number, string>()
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

  hydrate(relations: readonly ReactionRelation[], confirmedStates: readonly (readonly [number, number | null])[] = []): void {
    this.clear()
    for (const [atomId, stateId] of confirmedStates) {
      if (stateId !== null) this.#confirmedStateIdByAtom.set(atomId, stateId)
    }
    for (const relation of relations) this.upsert(relation)
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
    if (queue) {
      const remaining = queue.filter((queued) => queued.relationKey !== relationKey)
      if (remaining.length > 0) this.#queueByTargetAtom.set(relation.target.atomId, remaining)
      else this.#queueByTargetAtom.delete(relation.target.atomId)
    }
  }

  /** Routes only a Boundary-confirmed new State; current State is never replayed on link creation. */
  confirmState(event: ReactionStateCommit, timestamp: number): ReactionTriggerRequest[] {
    if (this.#lastEventIdBySourceAtom.get(event.atomId) === event.eventId) return []
    const current = this.#currentStateId(event.atomId)
    if (current !== event.stateId || this.#currentWimp(event.atomId) !== event.wimp) {
      throw new Error(`Matrix confirmed State ${event.stateId} does not match Atom ${event.atomId} current State`)
    }
    this.#lastEventIdBySourceAtom.set(event.atomId, event.eventId)
    this.#confirmedStateIdByAtom.set(event.atomId, event.stateId)

    const emitted: ReactionTriggerRequest[] = []
    this.#dropInactiveTargetWork(event.atomId)
    const resumed = this.#drain(event.atomId)
    if (resumed) emitted.push(resumed)
    const keys = [...(this.#relationKeysBySourceState.get(sourceStateKey(event.atomId, event.stateId)) ?? [])]
      .sort((left, right) => {
        const leftRelation = this.#relations.get(left)
        const rightRelation = this.#relations.get(right)
        return (leftRelation?.reactionId ?? 0) - (rightRelation?.reactionId ?? 0) || left.localeCompare(right)
      })

    for (const relationKey of keys) {
      const relation = this.#relations.get(relationKey)
      if (!relation || !this.#active(relation)) continue
      const queue = this.#queueByTargetAtom.get(relation.target.atomId)
      const queued = {relationKey, event: structuredClone(event), timestamp} satisfies QueuedReaction
      if (queue) queue.push(queued)
      else this.#queueByTargetAtom.set(relation.target.atomId, [queued])
      const request = this.#drain(relation.target.atomId)
      if (request) emitted.push(request)
    }
    return emitted
  }

  /** Releases exactly one target lane after Boundary publishes its terminal copy. */
  settle(commit: ReactionResultCommit): ReactionTriggerRequest | null {
    const targetAtomId = this.#targetAtomByExecutionId.get(commit.reactionExecutionId)
    if (targetAtomId === undefined) return null
    const pending = this.#pendingByTargetAtom.get(targetAtomId)
    if (!pending || pending.reactionExecutionId !== commit.reactionExecutionId) return null
    if (pending.relationKey !== commit.relationKey || pending.reactionId !== commit.reactionId) {
      throw new Error(`Reaction result ${commit.reactionExecutionId} does not match Matrix pending execution`)
    }
    this.#pendingByTargetAtom.delete(targetAtomId)
    this.#targetAtomByExecutionId.delete(commit.reactionExecutionId)
    return this.#drain(targetAtomId)
  }

  /** Removes all adjacency and queued work involving a retired Atom. */
  removeAtom(atomId: number): void {
    const relationKeys = [...this.#relations.values()]
      .filter((relation) => relation.source.atomId === atomId || relation.target.atomId === atomId)
      .map((relation) => relation.key)
    for (const relationKey of relationKeys) this.remove(relationKey)
    this.#dropTargetWork(atomId)
    this.#lastEventIdBySourceAtom.delete(atomId)
    this.#confirmedStateIdByAtom.delete(atomId)
  }

  clear(): void {
    this.#relations.clear()
    this.#relationKeysBySourceState.clear()
    this.#relationKeysByTargetAtom.clear()
    this.#queueByTargetAtom.clear()
    this.#pendingByTargetAtom.clear()
    this.#targetAtomByExecutionId.clear()
    this.#lastEventIdBySourceAtom.clear()
    this.#confirmedStateIdByAtom.clear()
  }

  pending(targetAtomId: number): string | null {
    return this.#pendingByTargetAtom.get(targetAtomId)?.reactionExecutionId ?? null
  }

  queued(targetAtomId: number): number {
    return this.#queueByTargetAtom.get(targetAtomId)?.length ?? 0
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
    const pendingRelation = pending ? this.#relations.get(pending.relationKey) : undefined
    if (pending && (!pendingRelation || !this.#active(pendingRelation))) {
      this.#targetAtomByExecutionId.delete(pending.reactionExecutionId)
      this.#pendingByTargetAtom.delete(atomId)
    }
    const queue = this.#queueByTargetAtom.get(atomId)
    if (!queue) return
    const remaining = queue.filter((queued) => {
      const relation = this.#relations.get(queued.relationKey)
      return relation !== undefined && this.#active(relation)
    })
    if (remaining.length > 0) this.#queueByTargetAtom.set(atomId, remaining)
    else this.#queueByTargetAtom.delete(atomId)
  }

  #dropTargetWork(atomId: number): void {
    this.#queueByTargetAtom.delete(atomId)
    const pending = this.#pendingByTargetAtom.get(atomId)
    if (pending) this.#targetAtomByExecutionId.delete(pending.reactionExecutionId)
    this.#pendingByTargetAtom.delete(atomId)
  }

  #drain(targetAtomId: number): ReactionTriggerRequest | null {
    if (this.#pendingByTargetAtom.has(targetAtomId)) return null
    const queue = this.#queueByTargetAtom.get(targetAtomId)
    while (queue && queue.length > 0) {
      const queued = queue.shift()!
      const relation = this.#relations.get(queued.relationKey)
      if (!relation || !this.#active(relation) ||
          relation.source.atomId !== queued.event.atomId ||
          relation.source.wimp !== queued.event.wimp ||
          !relation.source.states.some((state) => state.id === queued.event.stateId)) continue

      const reactionExecutionId = this.#executionId()
      const request: ReactionTriggerRequest = {
        kind: REACTION_TRIGGER_KIND,
        reactionExecutionId,
        relationKey: relation.key,
        reactionId: relation.reactionId,
        eventId: queued.event.eventId,
        targetAtomId,
        source: {
          atomId: queued.event.atomId,
          wimp: queued.event.wimp,
          stateId: queued.event.stateId,
          state: queued.event.state,
        },
        timestamp: queued.timestamp,
      }
      this.#pendingByTargetAtom.set(targetAtomId, {
        relationKey: relation.key,
        reactionId: relation.reactionId,
        reactionExecutionId,
      })
      this.#targetAtomByExecutionId.set(reactionExecutionId, targetAtomId)
      if (queue.length === 0) this.#queueByTargetAtom.delete(targetAtomId)
      this.#emit(request)
      return request
    }
    this.#queueByTargetAtom.delete(targetAtomId)
    return null
  }
}
