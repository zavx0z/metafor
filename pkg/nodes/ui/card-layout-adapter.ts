import type {LayoutDirection, LayoutPort, LayoutResult} from "@nodes/layout"
import {
  measureNodeSystemCardPreset,
  memoizedTextMeasurer,
  type NodeSystemTextMeasurer,
} from "./card-layout.ts"
import type {
  NodeSystemCardNode,
  NodeSystemCardPreset,
  PositionedNodeSystemCard,
} from "./card-model.ts"
import {
  materializeMeasuredNodeSystemLayout,
  prepareMeasuredNodeSystemLayout,
  type MeasuredLayoutPortContext,
  type MeasuredNodeSystemLayoutOptions,
  type MeasuredNodeSystemLayoutRequest,
  type PreparedMeasuredNodeSystemLayout,
} from "nodes/measured-layout"

const MAX_CONNECTED_ROW_ORDER_CANDIDATES = 2

export type NodeSystemCardLayoutOptions = MeasuredNodeSystemLayoutOptions & Readonly<{
  measureText?: NodeSystemTextMeasurer
}>

export type NodeSystemCardLayoutRequest = MeasuredNodeSystemLayoutRequest

export type PreparedNodeSystemCardLayoutPass<TPort extends LayoutPort = LayoutPort> =
  PreparedMeasuredNodeSystemLayout<NodeSystemCardNode, NodeSystemCardPreset["edges"][number], TPort>

export type NodeSystemCardLayoutPass = Readonly<{
  positioned: PositionedNodeSystemCard
  result: LayoutResult
}>

export type NodeSystemCardLayoutPolicy<TPort extends LayoutPort> = Readonly<{
  projectPort(context: MeasuredLayoutPortContext): TPort
  layout(graph: PreparedNodeSystemCardLayoutPass<TPort>["graph"]): LayoutResult
  isRecoverableError?(error: unknown): boolean
}>

/** Shared synchronous Card orchestration over one independently imported policy. */
export function layoutNodeSystemCardSync<TPort extends LayoutPort>(
  document: NodeSystemCardPreset,
  request: NodeSystemCardLayoutRequest,
  options: NodeSystemCardLayoutOptions,
  policy: NodeSystemCardLayoutPolicy<TPort>,
): PositionedNodeSystemCard {
  const measureText = memoizedTextMeasurer(options.measureText)
  const canonicalDocument = canonicalizeConnectedNodeSystemCardFacts(document)
  const first = calculateNodeSystemCardLayoutPass(
    canonicalDocument,
    request,
    options,
    measureText,
    policy,
  )
  let best = first
  for (const candidate of nodeSystemCardPortFactOrderCandidates(canonicalDocument, first)) {
    try {
      const ordered = calculateNodeSystemCardLayoutPass(candidate, request, options, measureText, policy)
      if (compareRoutingObjective(ordered.result, best.result) < 0) best = ordered
    } catch (error) {
      if (isRecoverableLayoutError(error) || policy.isRecoverableError?.(error) === true) continue
      throw error
    }
  }
  return best.positioned
}

/** Shared Card measurement and identity projection used by sync and Worker adapters. */
export function prepareNodeSystemCardLayoutPass<TPort extends LayoutPort>(
  document: NodeSystemCardPreset,
  request: NodeSystemCardLayoutRequest,
  options: NodeSystemCardLayoutOptions,
  measureText: NodeSystemTextMeasurer | undefined,
  projectPort: (context: MeasuredLayoutPortContext) => TPort,
): PreparedNodeSystemCardLayoutPass<TPort> {
  const measured = measureNodeSystemCardPreset(document, measureText)
  return prepareMeasuredNodeSystemLayout(document, measured, request, options, projectPort)
}

/** Shared result mapping; the semantic port remains unchanged and resolved side is separate. */
export function materializeNodeSystemCardLayoutPass<TPort extends LayoutPort>(
  prepared: PreparedNodeSystemCardLayoutPass<TPort>,
  result: LayoutResult,
): NodeSystemCardLayoutPass {
  const positioned = materializeMeasuredNodeSystemLayout(prepared, result) as PositionedNodeSystemCard
  return {positioned, result}
}

/**
 * Presentation-only ordering pass. It moves only connected socket-bearing fact
 * rows between their existing slots; domain facts, port identities and edges
 * remain unchanged.
 */
export function orderNodeSystemCardPortFactsForLayout(
  document: NodeSystemCardPreset,
  positioned: PositionedNodeSystemCard,
  _direction: LayoutDirection,
): NodeSystemCardPreset {
  const positionedNodes = new Map(positioned.nodes.map((entry) => [entry.node.id, entry]))
  const rowByPort = new Map<string, string>()
  for (const node of document.nodes) {
    for (const port of node.ports ?? []) rowByPort.set(enginePortId(node.id, port.id), port.rowId)
  }

  const coordinates = new Map<string, number[]>()
  const addCoordinate = (
    nodeId: string,
    portId: string,
    counterpartNodeId: string,
    counterpartPortId: string,
  ): void => {
    const rowId = rowByPort.get(enginePortId(nodeId, portId))
    const counterpart = positionedNodes.get(counterpartNodeId)
    if (rowId === undefined || counterpart === undefined) return
    const coordinate = counterpart.ports.find(({port}) => port.id === counterpartPortId)?.center.y
    if (coordinate === undefined) return
    const key = enginePortId(nodeId, rowId)
    const values = coordinates.get(key) ?? []
    values.push(coordinate)
    coordinates.set(key, values)
  }
  for (const edge of [...document.edges].sort(compareOrdered)) {
    addCoordinate(edge.source.nodeId, edge.source.portId, edge.target.nodeId, edge.target.portId)
    addCoordinate(edge.target.nodeId, edge.target.portId, edge.source.nodeId, edge.source.portId)
  }

  let changed = false
  const nodes = document.nodes.map((node): NodeSystemCardNode => {
    const facts = node.facts ?? []
    const connectedSlots = facts.flatMap((fact, index) =>
      coordinates.has(enginePortId(node.id, fact.id)) ? [index] : [])
    if (connectedSlots.length < 2) return node
    const positionedNode = positionedNodes.get(node.id)
    if (positionedNode === undefined) return node
    const portRows = new Map<string, number[]>()
    for (const entry of positionedNode.ports) {
      const rowId = rowByPort.get(enginePortId(node.id, entry.port.id))
      if (rowId === undefined) continue
      const rows = portRows.get(rowId) ?? []
      rows.push(entry.center.y)
      portRows.set(rowId, rows)
    }
    const slotYs = connectedSlots.map((index) => median(portRows.get(facts[index]!.id) ?? []))
    if (slotYs.some((value) => value === null)) return node
    const connectedFacts = connectedSlots.map((index) => facts[index]!)
    const orderedFacts = assignFactsToRows(
      node.id,
      connectedFacts,
      slotYs as number[],
      coordinates,
    )
    const nextFacts = [...facts]
    for (let index = 0; index < connectedSlots.length; index += 1) {
      nextFacts[connectedSlots[index]!] = orderedFacts[index]!
    }
    if (nextFacts.every((fact, index) => fact === facts[index])) return node
    changed = true
    return {...node, facts: nextFacts}
  })
  return changed ? {...document, nodes} : document
}

export function canonicalizeConnectedNodeSystemCardFacts(
  document: NodeSystemCardPreset,
): NodeSystemCardPreset {
  const rowByPort = new Map(document.nodes.flatMap((node) =>
    (node.ports ?? []).map((port) => [enginePortId(node.id, port.id), port.rowId] as const)))
  const connectedRows = new Map<string, Set<string>>()
  for (const edge of document.edges) {
    for (const endpoint of [edge.source, edge.target]) {
      const rowId = rowByPort.get(enginePortId(endpoint.nodeId, endpoint.portId))
      if (rowId === undefined) continue
      const rows = connectedRows.get(endpoint.nodeId) ?? new Set<string>()
      rows.add(rowId)
      connectedRows.set(endpoint.nodeId, rows)
    }
  }
  let changed = false
  const nodes = document.nodes.map((node): NodeSystemCardNode => {
    const connected = connectedRows.get(node.id)
    if (connected === undefined || connected.size < 2 || node.facts === undefined) return node
    const slots = node.facts.flatMap((fact, index) => connected.has(fact.id) ? [index] : [])
    if (slots.length < 2) return node
    const facts = [...node.facts]
    const ordered = slots.map((index) => facts[index]!).sort((left, right) => compareIds(left.id, right.id))
    for (let index = 0; index < slots.length; index += 1) facts[slots[index]!] = ordered[index]!
    if (facts.every((fact, index) => fact === node.facts![index])) return node
    changed = true
    return {...node, facts}
  })
  return changed ? {...document, nodes} : document
}

export function nodeSystemCardPortFactOrderCandidates(
  document: NodeSystemCardPreset,
  first: NodeSystemCardLayoutPass,
): readonly NodeSystemCardPreset[] {
  const candidates = new Map<string, NodeSystemCardPreset>()
  const originalKey = nodeSystemFactOrderKey(document)
  candidates.set(originalKey, document)
  const add = (candidate: NodeSystemCardPreset): void => {
    if (candidates.size >= MAX_CONNECTED_ROW_ORDER_CANDIDATES) return
    const key = nodeSystemFactOrderKey(candidate)
    if (!candidates.has(key)) candidates.set(key, candidate)
  }
  const heuristicCandidate = orderNodeSystemCardPortFactsForLayout(
    document,
    first.positioned,
    first.result.direction,
  )

  const edgeById = new Map(document.edges.map((edge) => [edge.id, edge]))
  const portByEndpoint = new Map(document.nodes.flatMap((node) =>
    (node.ports ?? []).map((port) => [enginePortId(node.id, port.id), port] as const)))
  const swaps = new Map<string, Readonly<{
    nodeId: string
    leftRowId: string
    rightRowId: string
    crossings: number
  }>>()
  for (const [leftEdgeId, rightEdgeId] of crossingEdgePairs(first.positioned)) {
    const left = edgeById.get(leftEdgeId)
    const right = edgeById.get(rightEdgeId)
    if (left === undefined || right === undefined) continue
    for (const leftEndpoint of [left.source, left.target]) {
      for (const rightEndpoint of [right.source, right.target]) {
        if (leftEndpoint.nodeId !== rightEndpoint.nodeId) continue
        const leftRowId = portByEndpoint.get(enginePortId(leftEndpoint.nodeId, leftEndpoint.portId))?.rowId
        const rightRowId = portByEndpoint.get(enginePortId(rightEndpoint.nodeId, rightEndpoint.portId))?.rowId
        if (leftRowId === undefined || rightRowId === undefined || leftRowId === rightRowId) continue
        const orderedRowIds = [leftRowId, rightRowId].sort(compareIds)
        const firstRowId = orderedRowIds[0]!
        const secondRowId = orderedRowIds[1]!
        const key = `${leftEndpoint.nodeId}\u0000${firstRowId}\u0000${secondRowId}`
        const previous = swaps.get(key)
        swaps.set(key, {
          nodeId: leftEndpoint.nodeId,
          leftRowId: firstRowId,
          rightRowId: secondRowId,
          crossings: (previous?.crossings ?? 0) + 1,
        })
      }
    }
  }
  let crossingCandidate = document
  const usedRows = new Map<string, Set<string>>()
  for (const swap of [...swaps.values()].sort((left, right) =>
    right.crossings - left.crossings ||
    compareIds(left.nodeId, right.nodeId) ||
    compareIds(left.leftRowId, right.leftRowId) ||
    compareIds(left.rightRowId, right.rightRowId))) {
    const used = usedRows.get(swap.nodeId) ?? new Set<string>()
    if (used.has(swap.leftRowId) || used.has(swap.rightRowId)) continue
    const swapped = swapNodeSystemFacts(crossingCandidate, swap.nodeId, swap.leftRowId, swap.rightRowId)
    if (swapped === crossingCandidate) continue
    crossingCandidate = swapped
    used.add(swap.leftRowId)
    used.add(swap.rightRowId)
    usedRows.set(swap.nodeId, used)
  }
  add(crossingCandidate === document ? heuristicCandidate : crossingCandidate)

  return [...candidates.entries()]
    .filter(([key]) => key !== originalKey)
    .map(([, candidate]) => candidate)
}

export function compareRoutingObjective(left: LayoutResult, right: LayoutResult): number {
  const leftMetrics = routingObjective(left)
  const rightMetrics = routingObjective(right)
  const pairs = [
    [leftMetrics.totalCrossings, rightMetrics.totalCrossings],
    [leftMetrics.maxCrossings, rightMetrics.maxCrossings],
    [leftMetrics.totalTurns, rightMetrics.totalTurns],
    [leftMetrics.maxTurns, rightMetrics.maxTurns],
    [leftMetrics.totalManhattan, rightMetrics.totalManhattan],
    [leftMetrics.maxManhattan, rightMetrics.maxManhattan],
    [leftMetrics.maxDetour, rightMetrics.maxDetour],
  ] as const
  for (const [leftValue, rightValue] of pairs) {
    if (leftValue !== rightValue) return leftValue - rightValue
  }
  return 0
}

export function isRecoverableLayoutError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("NO_LEGAL_LAYOUT")
}

function calculateNodeSystemCardLayoutPass<TPort extends LayoutPort>(
  document: NodeSystemCardPreset,
  request: NodeSystemCardLayoutRequest,
  options: NodeSystemCardLayoutOptions,
  measureText: NodeSystemTextMeasurer | undefined,
  policy: NodeSystemCardLayoutPolicy<TPort>,
): NodeSystemCardLayoutPass {
  const prepared = prepareNodeSystemCardLayoutPass(
    document,
    request,
    options,
    measureText,
    (context) => policy.projectPort(context),
  )
  return materializeNodeSystemCardLayoutPass(prepared, policy.layout(prepared.graph))
}

function crossingEdgePairs(positioned: PositionedNodeSystemCard): readonly (readonly [string, string])[] {
  const pairs = new Set<string>()
  const edges = [...positioned.edges].sort((left, right) => compareIds(left.edge.id, right.edge.id))
  for (let leftIndex = 0; leftIndex < edges.length; leftIndex += 1) {
    const left = edges[leftIndex]!
    for (let rightIndex = leftIndex + 1; rightIndex < edges.length; rightIndex += 1) {
      const right = edges[rightIndex]!
      let crosses = false
      for (let li = 1; li < left.points.length && !crosses; li += 1) {
        for (let ri = 1; ri < right.points.length; ri += 1) {
          if (!properPerpendicularLayoutCrossing(
            left.points[li - 1]!, left.points[li]!,
            right.points[ri - 1]!, right.points[ri]!,
          )) continue
          crosses = true
          break
        }
      }
      if (crosses) pairs.add(`${left.edge.id}\u0000${right.edge.id}`)
    }
  }
  return [...pairs].sort(compareIds).map((key) => {
    const [left, right] = key.split("\u0000")
    return [left!, right!] as const
  })
}

function swapNodeSystemFacts(
  document: NodeSystemCardPreset,
  nodeId: string,
  leftRowId: string,
  rightRowId: string,
): NodeSystemCardPreset {
  let changed = false
  const nodes = document.nodes.map((node): NodeSystemCardNode => {
    if (node.id !== nodeId || node.facts === undefined) return node
    const leftIndex = node.facts.findIndex(({id}) => id === leftRowId)
    const rightIndex = node.facts.findIndex(({id}) => id === rightRowId)
    if (leftIndex < 0 || rightIndex < 0) return node
    const facts = [...node.facts]
    const left = facts[leftIndex]!
    facts[leftIndex] = facts[rightIndex]!
    facts[rightIndex] = left
    changed = true
    return {...node, facts}
  })
  return changed ? {...document, nodes} : document
}

function nodeSystemFactOrderKey(document: NodeSystemCardPreset): string {
  return JSON.stringify([...document.nodes]
    .sort((left, right) => compareIds(left.id, right.id))
    .map((node) => [node.id, (node.facts ?? []).map(({id}) => id)]))
}

type RowAssignment = Readonly<{
  mismatches: number
  distance: number
  key: string
  facts: readonly number[]
}>

function assignFactsToRows(
  nodeId: string,
  facts: readonly NonNullable<NodeSystemCardNode["facts"]>[number][],
  slotYs: readonly number[],
  coordinates: ReadonlyMap<string, readonly number[]>,
): readonly NonNullable<NodeSystemCardNode["facts"]>[number][] {
  if (facts.length > 10) {
    return [...facts].sort((left, right) => {
      const leftMedian = median(coordinates.get(enginePortId(nodeId, left.id)) ?? []) ?? 0
      const rightMedian = median(coordinates.get(enginePortId(nodeId, right.id)) ?? []) ?? 0
      return leftMedian - rightMedian || compareIds(left.id, right.id)
    })
  }
  let states = new Map<number, RowAssignment>([[0, {
    mismatches: 0,
    distance: 0,
    key: "",
    facts: [],
  }]])
  for (let slot = 0; slot < slotYs.length; slot += 1) {
    const next = new Map<number, RowAssignment>()
    for (const [mask, state] of states) {
      for (let factIndex = 0; factIndex < facts.length; factIndex += 1) {
        if ((mask & (1 << factIndex)) !== 0) continue
        const fact = facts[factIndex]!
        const targets = coordinates.get(enginePortId(nodeId, fact.id)) ?? []
        const rowY = slotYs[slot]!
        const candidate: RowAssignment = {
          mismatches: state.mismatches + targets.filter((targetY) => targetY !== rowY).length,
          distance: state.distance + targets.reduce((sum, targetY) => sum + Math.abs(targetY - rowY), 0),
          key: `${state.key}\u0000${fact.id}`,
          facts: [...state.facts, factIndex],
        }
        const nextMask = mask | (1 << factIndex)
        const previous = next.get(nextMask)
        if (previous === undefined || compareRowAssignment(candidate, previous) < 0) {
          next.set(nextMask, candidate)
        }
      }
    }
    states = next
  }
  const result = states.get((1 << facts.length) - 1)
  return result === undefined ? facts : result.facts.map((index) => facts[index]!)
}

function compareRowAssignment(left: RowAssignment, right: RowAssignment): number {
  return left.mismatches - right.mismatches
    || left.distance - right.distance
    || compareIds(left.key, right.key)
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

function routingObjective(result: LayoutResult): Readonly<{
  totalCrossings: number
  maxCrossings: number
  totalTurns: number
  maxTurns: number
  totalManhattan: number
  maxManhattan: number
  maxDetour: number
}> {
  const pointsByEdge = result.edges.map(({id, sections}) => {
    const section = sections[0]
    const points = [section.startPoint, ...section.bendPoints, section.endPoint]
    return {id, points}
  })
  const crossingsByEdge = new Map(pointsByEdge.map(({id}) => [id, 0]))
  for (let leftIndex = 0; leftIndex < pointsByEdge.length; leftIndex += 1) {
    const left = pointsByEdge[leftIndex]!
    for (let rightIndex = leftIndex + 1; rightIndex < pointsByEdge.length; rightIndex += 1) {
      const right = pointsByEdge[rightIndex]!
      for (let li = 1; li < left.points.length; li += 1) {
        for (let ri = 1; ri < right.points.length; ri += 1) {
          if (!properPerpendicularLayoutCrossing(
            left.points[li - 1]!, left.points[li]!,
            right.points[ri - 1]!, right.points[ri]!,
          )) continue
          crossingsByEdge.set(left.id, crossingsByEdge.get(left.id)! + 1)
          crossingsByEdge.set(right.id, crossingsByEdge.get(right.id)! + 1)
        }
      }
    }
  }
  const edges = pointsByEdge.map(({points}) => {
    const section = {startPoint: points[0]!, bendPoints: points.slice(1, -1), endPoint: points.at(-1)!}
    const manhattan = points.slice(1).reduce((sum, point, index) => {
      const previous = points[index]!
      return sum + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
    }, 0)
    const direct = Math.abs(section.endPoint.x - section.startPoint.x) +
      Math.abs(section.endPoint.y - section.startPoint.y)
    return {turns: section.bendPoints.length, manhattan, detour: manhattan - direct}
  })
  return {
    totalCrossings: [...crossingsByEdge.values()].reduce((sum, value) => sum + value, 0) / 2,
    maxCrossings: Math.max(0, ...crossingsByEdge.values()),
    totalTurns: edges.reduce((sum, edge) => sum + edge.turns, 0),
    maxTurns: Math.max(0, ...edges.map((edge) => edge.turns)),
    totalManhattan: edges.reduce((sum, edge) => sum + edge.manhattan, 0),
    maxManhattan: Math.max(0, ...edges.map((edge) => edge.manhattan)),
    maxDetour: Math.max(0, ...edges.map((edge) => edge.detour)),
  }
}

function properPerpendicularLayoutCrossing(
  a: Readonly<{x: number; y: number}>,
  b: Readonly<{x: number; y: number}>,
  c: Readonly<{x: number; y: number}>,
  d: Readonly<{x: number; y: number}>,
): boolean {
  const firstHorizontal = a.y === b.y
  const secondHorizontal = c.y === d.y
  if (firstHorizontal === secondHorizontal) return false
  const horizontalA = firstHorizontal ? a : c
  const horizontalB = firstHorizontal ? b : d
  const verticalA = firstHorizontal ? c : a
  const verticalB = firstHorizontal ? d : b
  const x = verticalA.x
  const y = horizontalA.y
  return x > Math.min(horizontalA.x, horizontalB.x) && x < Math.max(horizontalA.x, horizontalB.x) &&
    y > Math.min(verticalA.y, verticalB.y) && y < Math.max(verticalA.y, verticalB.y)
}

function enginePortId(nodeId: string, portId: string): string {
  return `${nodeId}\u0000${portId}`
}

function compareOrdered<T extends {id: string; order?: number}>(left: T, right: T): number {
  return (left.order ?? 0) - (right.order ?? 0) || compareIds(left.id, right.id)
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
