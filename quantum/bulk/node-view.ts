import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {
  HudNodeViewAtom,
  HudNodeViewDocument,
  HudNodeViewEndpoint,
  HudNodeViewState,
  HudNodeViewTransition,
  HudNodeViewWire,
} from "@ui/hud"

const endpoint = (atomId: number, itemId: string): HudNodeViewEndpoint => ({atomId: String(atomId), itemId})
const item = (atomId: number, kind: "field" | "state", id: number): string => `${atomId}:${kind}:${id}`

/**
 * A derived view of the live Bulk projection. It owns no state and deliberately
 * exposes every declared Field/State/Transition of every materialized Atom.
 */
export function buildBulkNodeView(projection: BulkRuntimeProjection): HudNodeViewDocument {
  const fieldsByWimp = new Map<string, typeof projection.fields>()
  const statesByWimp = new Map<string, typeof projection.states>()
  const transitionsByWimp = new Map<string, typeof projection.transitions>()
  const conditionsByTransition = new Map<number, typeof projection.conditions>()
  const currentState = new Map(projection.atomStates.map((state) => [state.atom, state.state]))
  for (const field of projection.fields) addToGroup(fieldsByWimp, field.wimp, field)
  for (const state of projection.states) addToGroup(statesByWimp, state.wimp, state)
  for (const transition of projection.transitions) addToGroup(transitionsByWimp, transition.wimp, transition)
  for (const condition of projection.conditions) addToGroup(conditionsByTransition, condition.transition, condition)

  const children = new Map<number | null, number[]>()
  for (const atom of projection.atoms) addToGroup(children, atom.parentAtom, atom.id)
  const positions = new Map<number, {x: number; y: number; depth: number}>()
  let row = 0
  const visit = (parent: number | null, depth: number): void => {
    for (const atomId of children.get(parent) ?? []) {
      positions.set(atomId, {x: depth * 360, y: row * 340, depth})
      row += 1
      visit(atomId, depth + 1)
    }
  }
  visit(null, 0)

  const atoms: HudNodeViewAtom[] = []
  const transitions: HudNodeViewTransition[] = []
  const wires: HudNodeViewWire[] = []
  for (const atom of projection.atoms) {
    const placement = positions.get(atom.id) ?? {x: 0, y: 0, depth: 0}
    const fields = [...(fieldsByWimp.get(atom.wimp) ?? [])]
      .sort((left, right) => left.id - right.id)
      .map((field) => ({id: item(atom.id, "field", field.id), label: field.label ?? field.key, parameter: field.type}))
    const states: HudNodeViewState[] = [...(statesByWimp.get(atom.wimp) ?? [])]
      .sort((left, right) => left.position - right.position)
      .map((state) => ({id: item(atom.id, "state", state.id), label: state.name, active: currentState.get(atom.id) === state.id}))
    atoms.push({
      id: String(atom.id),
      title: atom.wimp.split("/").at(-1) ?? atom.wimp,
      x: placement.x,
      y: placement.y,
      ...(atom.parentAtom === null ? {} : {parentId: String(atom.parentAtom)}),
      fields,
      states,
    })
    for (const transition of transitionsByWimp.get(atom.wimp) ?? []) {
      const from = endpoint(atom.id, item(atom.id, "state", transition.fromState))
      const to = endpoint(atom.id, item(atom.id, "state", transition.toState))
      const conditions = conditionsByTransition.get(transition.id) ?? []
      const label = conditions.length === 0 ? "переход" : conditions.map((condition) => projection.fields.find((field) => field.id === condition.field)?.key ?? "условие").join(" · ")
      transitions.push({id: `${atom.id}:transition:${transition.id}`, from, to, label})
      for (const condition of conditions) {
        const field = projection.fields.find((candidate) => candidate.id === condition.field)
        if (!field) continue
        wires.push({
          id: `${atom.id}:condition:${condition.id}`,
          kind: "field-state",
          from: endpoint(atom.id, item(atom.id, "field", field.id)),
          to: from,
        })
      }
    }
  }
  return {atoms, transitions, wires}
}

function addToGroup<K, T>(map: Map<K, T[]>, key: K, value: T): void {
  const values = map.get(key) ?? []
  values.push(value)
  map.set(key, values)
}
