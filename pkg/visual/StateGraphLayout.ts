import type {
  StateGraph,
  StateGraphField,
  StateGraphSleeve,
  StateGraphTransition,
} from "./StateGraph.ts"
import {layoutFieldsInPseudoCircle} from "./FieldsLayout.ts"
import {
  TORUS_LAYOUT_BASELINE,
  resolveContentTorusForm,
  resolveTorusForm,
} from "./Torus.ts"
import {
  buildHermiteEdgePath,
  type HermiteEdgePoint,
} from "./HermiteEdge.ts"
import {resolveSemanticStateColor} from "./internal/semantic-state-color.ts"

const NODE_EMPTY_OUTER_RADIUS = 3.2
const NODE_FIELD_RADIUS =
  NODE_EMPTY_OUTER_RADIUS *
  TORUS_LAYOUT_BASELINE.rootFieldRadius /
  TORUS_LAYOUT_BASELINE.rootOuterRadius
const LEVEL_STEP = 22
const ROW_STEP = 15

export type StateGraphLayoutSizing = Readonly<{
  emptyOuterRadius: number
  fieldRadius: number
  orbitalContentByStateId?: ReadonlyMap<
    number,
    StateGraphOrbitalContentSizing
  >
  surfaceGap: number
}>

export type StateGraphOrbitalContentSizing = Readonly<{
  minimumMajorRadius: number
  minimumTubeRadius: number
}>

export type StateGraphNodeFormDimensions = Readonly<{
  holeRadius: number
  torusRadius: number
  torusTube: number
}>

export type StateGraphFieldPlacement = Readonly<StateGraphField & {
  radius: number
  x: number
  y: number
  z: number
}>

export const STATE_GRAPH_PRODUCTION_SIZING: StateGraphLayoutSizing = Object.freeze({
  emptyOuterRadius:
    TORUS_LAYOUT_BASELINE.rootOuterRadius *
    TORUS_LAYOUT_BASELINE.levelScale,
  fieldRadius:
    TORUS_LAYOUT_BASELINE.rootFieldRadius *
    TORUS_LAYOUT_BASELINE.levelScale,
  surfaceGap: TORUS_LAYOUT_BASELINE.rootFieldRadius * 2,
})

export type StateGraphLayoutNodeEnd =
  | "missing-state"
  | "terminal"
  | null

export type StateGraphLayoutNode = Readonly<{
  color: readonly [number, number, number]
  current: boolean
  end: StateGraphLayoutNodeEnd
  fieldRadius: number
  fields: readonly StateGraphField[]
  id: string
  innerRadius: number
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

export type StateGraphEdgePathPoint = HermiteEdgePoint

export const buildStateGraphHermiteEdgePath = (
  edge: StateGraphLayoutEdge,
  fromNode: StateGraphLayoutNode,
  toNode: StateGraphLayoutNode,
): readonly StateGraphEdgePathPoint[] => {
  const outerRadius = Math.max(fromNode.radius, toNode.radius)
  return buildHermiteEdgePath({
    from: fromNode,
    leftOuterRadius: outerRadius,
    rightOuterRadius: outerRadius,
    side: edge.returning ? -1 : 1,
    to: toNode,
  })
}

/** The sole State-edge sampling law, kept under the historical API name. */
export const buildStateGraphEdgePath = buildStateGraphHermiteEdgePath

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
  fieldRadius: number
  fields: readonly StateGraphField[]
  id: string
  innerRadius: number
  label: string
  radius: number
  stateId: number
  step: number
  x: number
  y: number
  z: number
}

const stateGraphColors = (
  graph: StateGraph,
): ReadonlyMap<number, readonly [number, number, number]> => {
  return new Map(graph.states.map((state) => [
    state.id,
    resolveSemanticStateColor(state.id),
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

export type StateGraphLayoutIndex = Readonly<{
  colors: ReadonlyMap<number, readonly [number, number, number]>
  fieldById: ReadonlyMap<number, StateGraphField>
  graph: StateGraph
  outgoing: ReadonlyMap<number, readonly StateGraphTransition[]>
  sleevesByRoot: ReadonlyMap<number, readonly StateGraphSleeve[]>
  states: ReadonlyMap<number, StateGraph["states"][number]>
  transitionById: ReadonlyMap<number, StateGraphTransition>
}>

/** Builds all graph-wide lookup tables once for every owner snapshot. */
export const indexStateGraphLayout = (
  graph: StateGraph,
): StateGraphLayoutIndex => {
  const outgoing = new Map<number, StateGraphTransition[]>()
  for (const transition of graph.transitions) {
    const bucket = outgoing.get(transition.fromStateId)
    if (bucket) bucket.push(transition)
    else outgoing.set(transition.fromStateId, [transition])
  }
  for (const bucket of outgoing.values()) bucket.sort(transitionOrder)
  return Object.freeze({
    colors: stateGraphColors(graph),
    fieldById: new Map(graph.fields.map((field) =>
      [field.id, field] as const
    )),
    graph,
    outgoing,
    sleevesByRoot: Map.groupBy(
      graph.sleeves,
      (sleeve) => sleeve.rootStateId,
    ),
    states: new Map(graph.states.map((state) =>
      [state.id, state] as const
    )),
    transitionById: new Map(graph.transitions.map((transition) =>
      [transition.id, transition] as const
    )),
  })
}

export const resolveStateGraphNodeGeometry = (
  fields: readonly StateGraphField[],
  emptyOuterRadius: number,
  fieldRadius: number,
  orbitalContent?: StateGraphOrbitalContentSizing,
): Readonly<{
  fieldRadius: number
  innerRadius: number
  outerRadius: number
}> => {
  const safeFieldRadius = Number.isFinite(fieldRadius)
    ? Math.max(0.001, fieldRadius)
    : 0.001
  const coreExtent = layoutFieldsInPseudoCircle(
    fields.length,
    safeFieldRadius,
  ).radius
  const coreForm = resolveContentTorusForm({
    emptyOuterRadius,
    coreExtent,
    gap: safeFieldRadius * TORUS_LAYOUT_BASELINE.contentGapToFieldRadius,
  })
  const minimumTubeRadius = Number.isFinite(
    orbitalContent?.minimumTubeRadius,
  )
    ? Math.max(0, orbitalContent?.minimumTubeRadius ?? 0)
    : 0
  const minimumMajorRadius = Number.isFinite(
    orbitalContent?.minimumMajorRadius,
  )
    ? Math.max(0, orbitalContent?.minimumMajorRadius ?? 0)
    : 0
  const tube = Math.max(coreForm.tube, minimumTubeRadius)
  const radius = Math.max(
    coreForm.innerRadius + tube,
    minimumMajorRadius,
  )
  const form = resolveTorusForm(radius - tube, radius + tube)
  return {
    fieldRadius: safeFieldRadius,
    innerRadius: form.innerRadius,
    outerRadius: form.outerRadius,
  }
}

export const stateGraphNodeFormDimensions = (
  outerRadius: number,
  innerRadius: number,
): StateGraphNodeFormDimensions => {
  const form = resolveTorusForm(innerRadius, outerRadius)
  return {
    torusRadius: form.radius,
    torusTube: form.tube,
    holeRadius: form.innerRadius,
  }
}

export const stateGraphFieldSphereLayout = (
  fields: readonly StateGraphField[],
  markerRadius: number,
): readonly StateGraphFieldPlacement[] => {
  if (fields.length === 0) return []
  const layout = layoutFieldsInPseudoCircle(fields.length, markerRadius)
  return fields.map((field, index) => ({
    ...field,
    radius: markerRadius,
    ...(layout.points[index] ?? {x: 0, y: 0, z: 0}),
  }))
}

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
  sizing?: StateGraphLayoutSizing,
): StateGraphRootLayout =>
  buildStateGraphRootLayoutFromIndex(
    indexStateGraphLayout(graph),
    rootStateId,
    sizing,
  )

export const buildStateGraphRootLayoutFromIndex = (
  index: StateGraphLayoutIndex,
  rootStateId: number,
  sizing?: StateGraphLayoutSizing,
): StateGraphRootLayout => {
  const {colors, fieldById, graph, outgoing, states} = index

  let edgeSequence = 0
  const nodes: MutableLayoutNode[] = []
  const edges: StateGraphLayoutEdge[] = []
  const nodesByStep = new Map<number, MutableLayoutNode[]>()
  const makeNode = (
    stateId: number,
    step: number,
    end: StateGraphLayoutNodeEnd,
    id: string,
  ): MutableLayoutNode => {
    const missing = end === "missing-state"
    const fields = [
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
    )
    const geometry = resolveStateGraphNodeGeometry(
      fields,
      sizing?.emptyOuterRadius ?? NODE_EMPTY_OUTER_RADIUS,
      sizing?.fieldRadius ?? NODE_FIELD_RADIUS,
      sizing?.orbitalContentByStateId?.get(stateId),
    )
    const node: MutableLayoutNode = {
      id,
      stateId,
      label: missing
        ? `Отсутствует State ${stateId}`
        : states.get(stateId)?.name ?? `State ${stateId}`,
      step,
      x: step * LEVEL_STEP,
      y: 0,
      z: 0,
      radius: geometry.outerRadius,
      innerRadius: geometry.innerRadius,
      fieldRadius: geometry.fieldRadius,
      color: missing
        ? [1, 0.24, 0.28]
        : colors.get(stateId) ?? [0.72, 0.78, 0.88],
      current: !missing && stateId === graph.currentStateId,
      end,
      fields,
    }
    nodes.push(node)
    const levelNodes = nodesByStep.get(step)
    if (levelNodes) levelNodes.push(node)
    else nodesByStep.set(step, [node])
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

  for (const levelNodes of nodesByStep.values()) {
    levelNodes.sort(
      (left, right) =>
        (states.get(left.stateId)?.position ?? Number.MAX_SAFE_INTEGER) -
          (states.get(right.stateId)?.position ?? Number.MAX_SAFE_INTEGER) ||
        left.stateId - right.stateId,
    )
    if (sizing) {
      const positions = new Array<number>(levelNodes.length)
      if (levelNodes.length > 0) positions[0] = 0
      for (let index = 1; index < levelNodes.length; index += 1) {
        positions[index] =
          positions[index - 1]! +
          levelNodes[index - 1]!.radius +
          sizing.surfaceGap +
          levelNodes[index]!.radius
      }
      const center = levelNodes.length === 0
        ? 0
        : (positions[0]! + positions.at(-1)!) * 0.5
      for (const [index, node] of levelNodes.entries()) {
        node.y = positions[index]! - center
      }
    } else {
      for (const [index, node] of levelNodes.entries()) {
        node.y = (index - (levelNodes.length - 1) / 2) * ROW_STEP
      }
    }
  }

  const orderedSteps = [...new Set(nodes.map((node) => node.step))]
    .sort((left, right) => left - right)
  const levelXByStep = new Map<number, number>()
  let previousX = 0
  let previousRadius = 0
  for (const [index, step] of orderedSteps.entries()) {
    const levelRadius = Math.max(
      0,
      ...(nodesByStep.get(step) ?? []).map((node) => node.radius),
    )
    const x = sizing && index > 0
      ? previousX + previousRadius + sizing.surfaceGap + levelRadius
      : step * LEVEL_STEP
    levelXByStep.set(step, x)
    previousX = x
    previousRadius = levelRadius
  }
  for (const node of nodes) {
    node.x = levelXByStep.get(node.step) ?? node.x
  }
  const levels = orderedSteps.map((step) => ({
    step,
    x: levelXByStep.get(step) ?? step * LEVEL_STEP,
    nodeIds: (nodesByStep.get(step) ?? []).map((node) => node.id),
  }))

  return {
    rootStateId,
    nodes,
    edges,
    levels,
  }
}

const pathPrefixKey = (
  transitionIds: readonly number[],
): string =>
  transitionIds.length === 0 ? "root" : transitionIds.join("-")

/**
 * Unfolds every possible path into a prefix tree. Prefixes are shared only
 * until a real Transition split. Every descendant of a split then keeps the
 * same lateral lane even when a neighbouring path ends.
 */
export const buildStateGraphBranchLayout = (
  graph: StateGraph,
  rootStateId: number,
  sizing?: StateGraphLayoutSizing,
): StateGraphRootLayout =>
  buildStateGraphBranchLayoutFromIndex(
    indexStateGraphLayout(graph),
    rootStateId,
    sizing,
  )

export const buildStateGraphBranchLayoutFromIndex = (
  index: StateGraphLayoutIndex,
  rootStateId: number,
  sizing?: StateGraphLayoutSizing,
): StateGraphRootLayout => {
  const {graph} = index
  const templateLayout = buildStateGraphRootLayoutFromIndex(
    index,
    rootStateId,
    sizing,
  )
  const rootTemplate = templateLayout.nodes.find(
    (node) =>
      node.stateId === rootStateId &&
      node.end !== "missing-state",
  )
  const sleeves = index.sleevesByRoot.get(rootStateId) ?? []
  if (!rootTemplate || sleeves.length === 0) return templateLayout

  const transitionById = index.transitionById
  const stateTemplateById = new Map<number, StateGraphLayoutNode>()
  const missingTemplateById = new Map<number, StateGraphLayoutNode>()
  for (const node of templateLayout.nodes) {
    const templates = node.end === "missing-state"
      ? missingTemplateById
      : stateTemplateById
    if (!templates.has(node.stateId)) templates.set(node.stateId, node)
  }

  const levelStep = templateLayout.levels.find(
    (level) => level.step > 0,
  )
  const levelDistance = levelStep
    ? levelStep.x / levelStep.step
    : LEVEL_STEP
  const nodes: MutableLayoutNode[] = []
  const nodesByStep = new Map<number, MutableLayoutNode[]>()
  const nodeByPrefix = new Map<string, MutableLayoutNode>()
  const childrenByNodeId = new Map<string, Set<string>>()
  const edges: StateGraphLayoutEdge[] = []
  const edgeKeys = new Set<string>()

  const makeNode = (
    template: StateGraphLayoutNode,
    prefix: readonly number[],
    step: number,
  ): MutableLayoutNode => {
    const prefixKey = pathPrefixKey(prefix)
    const node: MutableLayoutNode = {
      ...template,
      id:
        `root/${rootStateId}/path/${prefixKey}/state/` +
        `${template.stateId}`,
      step,
      x: step * levelDistance,
      y: 0,
      z: 0,
    }
    nodes.push(node)
    const levelNodes = nodesByStep.get(step)
    if (levelNodes) levelNodes.push(node)
    else nodesByStep.set(step, [node])
    nodeByPrefix.set(prefixKey, node)
    return node
  }

  const rootNode = makeNode(rootTemplate, [], 0)

  const addEdge = (
    transitionId: number,
    prefix: readonly number[],
    fromNode: MutableLayoutNode,
    toNode: MutableLayoutNode,
    returning: boolean,
  ): void => {
    const edgeKey =
      `${pathPrefixKey(prefix)}:${transitionId}:${returning}`
    if (edgeKeys.has(edgeKey)) return
    const transition = transitionById.get(transitionId)
    if (!transition) return
    edgeKeys.add(edgeKey)
    edges.push({
      id: `root/${rootStateId}/edge/${edgeKey}`,
      transitionId,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      returning,
      conditionCount: transition.conditions.length,
      conditionFieldIds: transition.conditions.map(
        (condition) => condition.fieldId,
      ),
    })
    if (!returning) {
      const children = childrenByNodeId.get(fromNode.id)
      if (children) children.add(toNode.id)
      else childrenByNodeId.set(fromNode.id, new Set([toNode.id]))
    }
  }

  for (const sleeve of sleeves) {
    let fromNode = rootNode
    const occurrenceByStateId =
      new Map<number, MutableLayoutNode>([
        [rootStateId, rootNode],
      ])

    for (
      let stateIndex = 1;
      stateIndex < sleeve.stateIds.length;
      stateIndex += 1
    ) {
      const transitionId = sleeve.transitionIds[stateIndex - 1]
      const stateId = sleeve.stateIds[stateIndex]
      if (transitionId === undefined || stateId === undefined) continue
      const prefix = sleeve.transitionIds.slice(0, stateIndex)
      const prefixKey = pathPrefixKey(prefix)
      let toNode = nodeByPrefix.get(prefixKey)
      if (!toNode) {
        const template = stateTemplateById.get(stateId)
        if (!template) continue
        toNode = makeNode(template, prefix, stateIndex)
      }
      addEdge(transitionId, prefix, fromNode, toNode, false)
      occurrenceByStateId.set(stateId, toNode)
      fromNode = toNode
    }

    if (sleeve.end.kind === "cycle") {
      const transitionId = sleeve.transitionIds.at(-1)
      const toNode = occurrenceByStateId.get(
        sleeve.end.targetStateId,
      )
      if (transitionId !== undefined && toNode) {
        addEdge(
          transitionId,
          sleeve.transitionIds,
          fromNode,
          toNode,
          true,
        )
      }
    } else if (sleeve.end.kind === "missing-state") {
      const transitionId = sleeve.transitionIds.at(-1)
      if (transitionId === undefined) continue
      const prefix = sleeve.transitionIds
      const prefixKey = pathPrefixKey(prefix)
      let toNode = nodeByPrefix.get(prefixKey)
      if (!toNode) {
        const template = missingTemplateById.get(
          sleeve.end.targetStateId,
        )
        if (!template) continue
        toNode = makeNode(
          template,
          prefix,
          sleeve.stateIds.length,
        )
      }
      addEdge(transitionId, prefix, fromNode, toNode, false)
    }
  }

  const nodeById = new Map(
    nodes.map((node) => [node.id, node] as const),
  )
  const leaves = nodes.filter(
    (node) => (childrenByNodeId.get(node.id)?.size ?? 0) === 0,
  )
  for (const [index, leaf] of leaves.entries()) {
    leaf.y = index - (leaves.length - 1) / 2
  }
  for (
    const node of [...nodes].sort(
      (left, right) => right.step - left.step,
    )
  ) {
    const childIds = childrenByNodeId.get(node.id)
    if (!childIds || childIds.size === 0) continue
    const childYs = [...childIds]
      .map((childId) => nodeById.get(childId)?.y)
      .filter((value): value is number => value !== undefined)
    if (childYs.length === 0) continue
    node.y = (Math.min(...childYs) + Math.max(...childYs)) / 2
  }

  const orderedSteps = [...new Set(nodes.map((node) => node.step))]
    .sort((left, right) => left - right)
  let laneStep = ROW_STEP
  if (sizing) {
    laneStep = 0
    for (const levelNodes of nodesByStep.values()) {
      const orderedNodes = [...levelNodes].sort(
        (left, right) => left.y - right.y,
      )
      for (let index = 1; index < orderedNodes.length; index += 1) {
        const previous = orderedNodes[index - 1]!
        const current = orderedNodes[index]!
        const laneDistance = current.y - previous.y
        if (laneDistance <= 1e-9) continue
        laneStep = Math.max(
          laneStep,
          (
            previous.radius +
            sizing.surfaceGap +
            current.radius
          ) / laneDistance,
        )
      }
    }
  }
  for (const node of nodes) node.y *= laneStep

  const levelXByStep = new Map<number, number>()
  let previousX = 0
  let previousRadius = 0
  for (const [index, step] of orderedSteps.entries()) {
    const levelRadius = Math.max(
      0,
      ...(nodesByStep.get(step) ?? []).map((node) => node.radius),
    )
    const x = sizing && index > 0
      ? previousX + previousRadius + sizing.surfaceGap + levelRadius
      : step * levelDistance
    levelXByStep.set(step, x)
    previousX = x
    previousRadius = levelRadius
  }
  for (const node of nodes) {
    node.x = levelXByStep.get(node.step) ?? node.x
  }
  const levels = orderedSteps.map((step) => ({
    step,
    x: levelXByStep.get(step) ?? step * levelDistance,
    nodeIds: (nodesByStep.get(step) ?? []).map((node) => node.id),
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
