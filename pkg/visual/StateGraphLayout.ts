import type {
  StateGraph,
  StateGraphField,
  StateGraphSleeve,
  StateGraphTransition,
} from "./StateGraph.ts"

const NODE_RADIUS = 3.2
const LEVEL_STEP = 22
const ROW_STEP = 15

export type StateGraphLayoutNodeEnd =
  | "missing-state"
  | "terminal"
  | null

export type StateGraphLayoutNode = Readonly<{
  color: readonly [number, number, number]
  current: boolean
  end: StateGraphLayoutNodeEnd
  fields: readonly StateGraphField[]
  id: string
  label: string
  radius: number
  stateId: number
  step: number
  x: number
  y: number
  z: number
}>

export type StateGraphLayoutEdge = Readonly<{
  conditionCount: number
  conditionFieldIds: readonly number[]
  fromNodeId: string
  id: string
  returning: boolean
  toNodeId: string
  transitionId: number
}>

export type StateGraphLayoutLevel = Readonly<{
  nodeIds: readonly string[]
  step: number
  x: number
}>

export type StateGraphRootLayout = Readonly<{
  edges: readonly StateGraphLayoutEdge[]
  levels: readonly StateGraphLayoutLevel[]
  nodes: readonly StateGraphLayoutNode[]
  rootStateId: number
}>

export type StateGraphRootDescription = Readonly<{
  conditionCount: number
  levelCount: number
  nodeCount: number
  pathCount: number
  paths: readonly string[]
  title: string
  transitionCount: number
}>

type MutableLayoutNode = {
  color: readonly [number, number, number]
  current: boolean
  end: StateGraphLayoutNodeEnd
  fields: readonly StateGraphField[]
  id: string
  label: string
  radius: number
  stateId: number
  step: number
  x: number
  y: number
  z: number
}

const hueChannel = (p: number, q: number, input: number): number => {
  let hue = input
  if (hue < 0) hue += 1
  if (hue > 1) hue -= 1
  if (hue < 1 / 6) return p + (q - p) * 6 * hue
  if (hue < 1 / 2) return q
  if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6
  return p
}

const stateGraphColor = (
  index: number,
  count: number,
): readonly [number, number, number] => {
  const hue = (0.52 + index / Math.max(1, count)) % 1
  const saturation = 0.82
  const lightness = 0.58
  const q = lightness + saturation - lightness * saturation
  const p = 2 * lightness - q
  return [
    hueChannel(p, q, hue + 1 / 3),
    hueChannel(p, q, hue),
    hueChannel(p, q, hue - 1 / 3),
  ]
}

const stateGraphColors = (
  graph: StateGraph,
): ReadonlyMap<number, readonly [number, number, number]> => {
  const orderedStates = [...graph.states].sort(
    (left, right) => left.position - right.position || left.id - right.id,
  )
  return new Map(orderedStates.map((state, index) => [
    state.id,
    stateGraphColor(index, orderedStates.length),
  ]))
}

const stateName = (
  graph: StateGraph,
  stateId: number,
): string => graph.states.find((state) => state.id === stateId)?.name ?? `State ${stateId}`

const transitionOrder = (
  left: StateGraphTransition,
  right: StateGraphTransition,
): number => left.position - right.position || left.id - right.id

const pathText = (
  graph: StateGraph,
  sleeve: StateGraphSleeve,
): string => {
  const names = sleeve.stateIds.map((stateId) => stateName(graph, stateId))
  if (sleeve.end.kind === "cycle") {
    names.push(`↺ ${stateName(graph, sleeve.end.targetStateId)}`)
  } else if (sleeve.end.kind === "missing-state") {
    names.push(`отсутствует State ${sleeve.end.targetStateId}`)
  }
  return names.join(" → ")
}

/**
 * Places every reachable State exactly once. X is the shortest transition
 * distance from the selected root, so each level is the first step on which a
 * State can be reached. A Transition to the same or an earlier level points
 * back to the existing State node instead of duplicating it.
 */
export const buildStateGraphRootLayout = (
  graph: StateGraph,
  rootStateId: number,
): StateGraphRootLayout => {
  const states = new Map(graph.states.map((state) => [state.id, state] as const))
  const colors = stateGraphColors(graph)
  const fieldById = new Map(graph.fields.map((field) => [field.id, field]))
  const outgoing = new Map<number, StateGraphTransition[]>()
  for (const transition of graph.transitions) {
    const bucket = outgoing.get(transition.fromStateId)
    if (bucket) bucket.push(transition)
    else outgoing.set(transition.fromStateId, [transition])
  }
  for (const bucket of outgoing.values()) bucket.sort(transitionOrder)

  let edgeSequence = 0
  const nodes: MutableLayoutNode[] = []
  const edges: StateGraphLayoutEdge[] = []
  const makeNode = (
    stateId: number,
    step: number,
    end: StateGraphLayoutNodeEnd,
    id: string,
  ): MutableLayoutNode => {
    const missing = end === "missing-state"
    const node: MutableLayoutNode = {
      id,
      stateId,
      label: missing ? `Отсутствует State ${stateId}` : stateName(graph, stateId),
      step,
      x: step * LEVEL_STEP,
      y: 0,
      z: 0,
      radius: NODE_RADIUS,
      color: missing
        ? [1, 0.24, 0.28]
        : colors.get(stateId) ?? [0.72, 0.78, 0.88],
      current: !missing && stateId === graph.currentStateId,
      end,
      fields: [
        ...new Set(
          (outgoing.get(stateId) ?? []).flatMap((transition) =>
            transition.conditions.map((condition) => condition.fieldId)
          ),
        ),
      ].map((fieldId) =>
        fieldById.get(fieldId) ?? {
          id: fieldId,
          key: `field-${fieldId}`,
          label: `Field ${fieldId}`,
          type: "string" as const,
        }
      ),
    }
    nodes.push(node)
    return node
  }

  const steps = new Map<number, number>()
  if (states.has(rootStateId)) {
    steps.set(rootStateId, 0)
    const queue = [rootStateId]
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const stateId = queue[cursor]!
      const nextStep = (steps.get(stateId) ?? 0) + 1
      for (const transition of outgoing.get(stateId) ?? []) {
        if (!states.has(transition.toStateId) || steps.has(transition.toStateId)) {
          continue
        }
        steps.set(transition.toStateId, nextStep)
        queue.push(transition.toStateId)
      }
    }
  }

  const stateNodes = new Map<number, MutableLayoutNode>()
  for (const [stateId, step] of [...steps].sort(
    ([leftId, leftStep], [rightId, rightStep]) =>
      leftStep - rightStep ||
      (states.get(leftId)?.position ?? 0) - (states.get(rightId)?.position ?? 0) ||
      leftId - rightId,
  )) {
    const node = makeNode(
      stateId,
      step,
      (outgoing.get(stateId) ?? []).length === 0 ? "terminal" : null,
      `root/${rootStateId}/state/${stateId}`,
    )
    stateNodes.set(stateId, node)
  }

  for (const [stateId, fromNode] of stateNodes) {
    for (const transition of outgoing.get(stateId) ?? []) {
      let toNode = stateNodes.get(transition.toStateId)
      if (!toNode) {
        toNode = makeNode(
          transition.toStateId,
          fromNode.step + 1,
          "missing-state",
          `root/${rootStateId}/missing/${transition.id}/${transition.toStateId}`,
        )
      }
      edges.push({
        id: `root/${rootStateId}/edge/${edgeSequence++}`,
        transitionId: transition.id,
        fromNodeId: fromNode.id,
        toNodeId: toNode.id,
        returning: toNode.step < fromNode.step,
        conditionCount: transition.conditions.length,
        conditionFieldIds: transition.conditions.map((condition) => condition.fieldId),
      })
    }
  }

  const nodesByStep = new Map<number, MutableLayoutNode[]>()
  for (const node of nodes) {
    const bucket = nodesByStep.get(node.step)
    if (bucket) bucket.push(node)
    else nodesByStep.set(node.step, [node])
  }
  for (const levelNodes of nodesByStep.values()) {
    levelNodes.sort(
      (left, right) =>
        (states.get(left.stateId)?.position ?? Number.MAX_SAFE_INTEGER) -
          (states.get(right.stateId)?.position ?? Number.MAX_SAFE_INTEGER) ||
        left.stateId - right.stateId,
    )
    for (const [index, node] of levelNodes.entries()) {
      node.y = (index - (levelNodes.length - 1) / 2) * ROW_STEP
    }
  }

  const levels = [...new Set(nodes.map((node) => node.step))]
    .sort((left, right) => left - right)
    .map((step) => ({
      step,
      x: step * LEVEL_STEP,
      nodeIds: nodes.filter((node) => node.step === step).map((node) => node.id),
    }))

  return {
    rootStateId,
    nodes,
    edges,
    levels,
  }
}

export const describeStateGraphRoot = (
  graph: StateGraph,
  layout: StateGraphRootLayout,
  rootIndex: number,
): StateGraphRootDescription => {
  const sleeves = graph.sleeves.filter((sleeve) => sleeve.rootStateId === layout.rootStateId)
  const transitionById = new Map(
    graph.transitions.map((transition) => [transition.id, transition] as const),
  )
  return {
    title: `Граф ${rootIndex + 1} · старт: ${stateName(graph, layout.rootStateId)}`,
    nodeCount: layout.nodes.length,
    transitionCount: layout.edges.length,
    conditionCount: layout.edges.reduce((count, edge) => count + edge.conditionCount, 0),
    levelCount: layout.levels.length,
    pathCount: sleeves.length,
    paths: sleeves.map((sleeve) => pathText(graph, sleeve)),
  }
}
