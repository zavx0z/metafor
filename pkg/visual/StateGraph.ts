import type {
  BulkRuntimeCondition,
  BulkRuntimeProjection,
  BulkRuntimeState,
  BulkRuntimeTransition,
} from "@metafor/types/bulk/runtime"

export type StateGraphCondition = Readonly<{
  fieldId: number
  id: number
  predicate: unknown
}>

export type StateGraphTransition = Readonly<{
  conditions: readonly StateGraphCondition[]
  fromStateId: number
  id: number
  position: number
  toStateId: number
}>

export type StateGraphState = Readonly<{
  current: boolean
  id: number
  name: string
  position: number
}>

export type StateGraphSleeveEnd =
  | Readonly<{kind: "terminal"}>
  | Readonly<{kind: "cycle"; targetStateId: number}>
  | Readonly<{kind: "missing-state"; targetStateId: number}>

export type StateGraphSleeve = Readonly<{
  end: StateGraphSleeveEnd
  id: string
  rootStateId: number
  stateIds: readonly number[]
  transitionIds: readonly number[]
}>

export type StateGraph = Readonly<{
  atomId: number
  atomLabel: string
  currentStateId: number | null
  reachableStateIds: readonly number[]
  sleeves: readonly StateGraphSleeve[]
  src: string
  states: readonly StateGraphState[]
  transitions: readonly StateGraphTransition[]
}>

const byPositionThenId = <T extends {id: number; position: number}>(
  left: T,
  right: T,
): number => left.position - right.position || left.id - right.id

const conditionForGraph = (
  condition: BulkRuntimeCondition,
): StateGraphCondition => ({
  id: condition.id,
  fieldId: condition.field,
  predicate: structuredClone(condition.predicate),
})

const transitionForGraph = (
  transition: BulkRuntimeTransition,
  conditions: readonly BulkRuntimeCondition[],
): StateGraphTransition => ({
  id: transition.id,
  fromStateId: transition.fromState,
  toStateId: transition.toState,
  position: transition.position,
  conditions: conditions
    .filter((condition) => condition.transition === transition.id)
    .sort(byPositionThenId)
    .map(conditionForGraph),
})

const stateForGraph = (
  state: BulkRuntimeState,
  currentStateId: number | null,
): StateGraphState => ({
  id: state.id,
  name: state.name,
  position: state.position,
  current: state.id === currentStateId,
})

/**
 * Enumerates every finite path from every declared State. A path-local
 * visited set keeps every path finite while preserving a cycle-closing
 * Transition as an explicit reference to an existing State. Reachability from
 * the materialized current State is retained separately for inspection.
 */
export const buildStateGraph = (
  projection: BulkRuntimeProjection,
  atomId: number,
): StateGraph => {
  const atom = projection.atoms.find((candidate) => candidate.id === atomId)
  if (!atom) throw new Error(`State Graph Atom ${atomId} is absent`)
  const currentStateId =
    projection.atomStates.find((candidate) => candidate.atom === atomId)?.state ?? null
  const states = projection.states
    .filter((state) => state.wimp === atom.wimp)
    .sort(byPositionThenId)
    .map((state) => stateForGraph(state, currentStateId))
  const stateById = new Map(states.map((state) => [state.id, state] as const))
  const transitions = projection.transitions
    .filter((transition) => transition.wimp === atom.wimp)
    .sort(byPositionThenId)
    .map((transition) => transitionForGraph(transition, projection.conditions))
  const outgoing = new Map<number, StateGraphTransition[]>()
  for (const transition of transitions) {
    const bucket = outgoing.get(transition.fromStateId)
    if (bucket) bucket.push(transition)
    else outgoing.set(transition.fromStateId, [transition])
  }

  const sleeves: StateGraphSleeve[] = []
  const reachableStateIds = new Set<number>()
  const emit = (
    rootStateId: number,
    stateIds: readonly number[],
    transitionIds: readonly number[],
    end: StateGraphSleeveEnd,
  ): void => {
    sleeves.push({
      id: transitionIds.length === 0
        ? `atom/${atomId}/root/${rootStateId}/state/${stateIds[0] ?? "none"}`
        : `atom/${atomId}/root/${rootStateId}/path/${transitionIds.join("-")}`,
      rootStateId,
      stateIds: [...stateIds],
      transitionIds: [...transitionIds],
      end,
    })
  }
  const visit = (
    rootStateId: number,
    stateId: number,
    visited: ReadonlySet<number>,
    stateIds: readonly number[],
    transitionIds: readonly number[],
  ): void => {
    if (rootStateId === currentStateId) reachableStateIds.add(stateId)
    const stateOutgoing = outgoing.get(stateId) ?? []
    if (stateOutgoing.length === 0) {
      emit(rootStateId, stateIds, transitionIds, {kind: "terminal"})
      return
    }
    for (const transition of stateOutgoing) {
      const nextTransitionIds = [...transitionIds, transition.id]
      if (!stateById.has(transition.toStateId)) {
        emit(rootStateId, stateIds, nextTransitionIds, {
          kind: "missing-state",
          targetStateId: transition.toStateId,
        })
        continue
      }
      if (visited.has(transition.toStateId)) {
        emit(rootStateId, stateIds, nextTransitionIds, {
          kind: "cycle",
          targetStateId: transition.toStateId,
        })
        continue
      }
      visit(
        rootStateId,
        transition.toStateId,
        new Set([...visited, transition.toStateId]),
        [...stateIds, transition.toStateId],
        nextTransitionIds,
      )
    }
  }

  for (const rootState of states) {
    visit(
      rootState.id,
      rootState.id,
      new Set([rootState.id]),
      [rootState.id],
      [],
    )
  }

  return {
    atomId,
    atomLabel:
      projection.wimps.find((wimp) => wimp.src === atom.wimp)?.name ?? atom.wimp,
    src: atom.wimp,
    currentStateId,
    states,
    transitions,
    reachableStateIds: [...reachableStateIds],
    sleeves,
  }
}
