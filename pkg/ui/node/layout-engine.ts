import type {
  NodeSystemDocument,
  NodeSystemEdge,
  NodeSystemNode,
  NodeSystemPort,
  PositionedNodeSystem,
  PositionedNodeSystemEdge,
  PositionedNodeSystemNode,
  PositionedNodeSystemPort,
} from "./model.ts"
import {
  NODE_SYSTEM_PORT_PITCH,
  measureNodeSystemCard,
  memoizedTextMeasurer,
  nodeSystemGeometryKey,
  planNodeSystemCard,
  type NodeSystemTextMeasurer,
} from "./card-layout.ts"
import {
  placeGraph,
  placementCandidates,
  type IntrinsicPort,
  type PlacementInput,
  type PlacementResult,
} from "./place-graph.ts"
import {
  routeGraph,
  type RouteEdge,
  type RouteGraphResult,
} from "./route-graph.ts"
import {validateNodeSystemDocument, validatePositionedNodeSystem} from "./validation.ts"

export type LayoutGraphResult = Readonly<{
  placement: PlacementResult
  routing: RouteGraphResult
  candidates: Readonly<{generated: number; routable: number}>
}>

export type NodeSystemLayoutDirection = "RIGHT" | "DOWN"

export type MetaForNodeSystemLayoutOptions = Readonly<{
  clearance?: number
  nodeSpacing?: number
  layerSpacing?: number
  padding?: number
  measureText?: NodeSystemTextMeasurer
}>

export type MetaForNodeSystemLayoutRequest = Readonly<{
  viewport: Readonly<{width: number; height: number}>
}>

type LayoutPass = Readonly<{
  positioned: PositionedNodeSystem
  result: LayoutGraphResult
}>

const UNITS_PER_PIXEL = 1_000

/**
 * Serializable synchronous core. A future Worker adapter can structured-clone
 * this input and result without changing placement or routing behavior.
 *
 * Placement combines layered median/barycenter ordering with bounded
 * Brandes–Köpf-inspired compaction; routing uses an obstacle visibility grid
 * and lexicographic A*. Network simplex is an architectural reference only,
 * not a product dependency or solver.
 *
 * @see https://boriskoepf.de/papers/gd01a.pdf
 * @see https://users.monash.edu/~mwybrow/papers/wybrow-gd-2009.pdf
 * @see https://graphviz.org/documentation/TSE93.pdf
 */
export function layoutGraph(input: PlacementInput): LayoutGraphResult {
  const placements = placementCandidates(input)
  const stableKey = (placement: PlacementResult): string => JSON.stringify({
    nodes: placement.nodes,
    ports: placement.ports,
    bounds: placement.bounds,
  })
  const preferredKey = input.viewport.width >= input.viewport.height
    ? stableKey(placeGraph(input))
    : null
  const comparePlacementQuality = (left: PlacementResult, right: PlacementResult): number => {
    if (preferredKey !== null) {
      const leftPreferred = stableKey(left) === preferredKey
      const rightPreferred = stableKey(right) === preferredKey
      if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1
    } else {
      // Owner-selected compact portrait policy: empty display pixels and large
      // empty compound areas are acceptance defects before soft path costs.
      if (left.metrics.displayEmptyRatio !== right.metrics.displayEmptyRatio) {
        return left.metrics.displayEmptyRatio - right.metrics.displayEmptyRatio
      }
      if (left.metrics.compoundEmptyRatio !== right.metrics.compoundEmptyRatio) {
        return left.metrics.compoundEmptyRatio - right.metrics.compoundEmptyRatio
      }
      if (left.metrics.fitScale !== right.metrics.fitScale) {
        return right.metrics.fitScale - left.metrics.fitScale
      }
      const leftArea = left.bounds.w * left.bounds.h
      const rightArea = right.bounds.w * right.bounds.h
      if (leftArea !== rightArea) return leftArea - rightArea
    }
    return 0
  }
  const ordered = [...placements].sort((left, right) =>
    comparePlacementQuality(left, right) || compareIds(stableKey(left), stableKey(right)))
  const compareRoutingQuality = (left: LayoutGraphResult, right: LayoutGraphResult): number => {
    const leftMetrics = left.routing.metrics
    const rightMetrics = right.routing.metrics
    const primary = leftMetrics.totalTurns - rightMetrics.totalTurns ||
      leftMetrics.maxTurns - rightMetrics.maxTurns ||
      left.placement.metrics.sourceCorridorDeficit - right.placement.metrics.sourceCorridorDeficit ||
      leftMetrics.totalManhattan - rightMetrics.totalManhattan ||
      leftMetrics.maxManhattan - rightMetrics.maxManhattan ||
      leftMetrics.maxDetour - rightMetrics.maxDetour
    if (primary !== 0) return primary
    const leftDetours = [...leftMetrics.perEdge].sort((a, b) => compareIds(a.edgeId, b.edgeId)).map(({detour}) => detour)
    const rightDetours = [...rightMetrics.perEdge].sort((a, b) => compareIds(a.edgeId, b.edgeId)).map(({detour}) => detour)
    for (let index = 0; index < Math.max(leftDetours.length, rightDetours.length); index += 1) {
      const difference = (leftDetours[index] ?? 0) - (rightDetours[index] ?? 0)
      if (difference !== 0) return difference
    }
    return leftMetrics.clearanceVariance - rightMetrics.clearanceVariance ||
      leftMetrics.crossings - rightMetrics.crossings ||
      compareIds(stableKey(left.placement), stableKey(right.placement))
  }
  for (let start = 0; start < ordered.length;) {
    let end = start + 1
    while (end < ordered.length && comparePlacementQuality(ordered[start]!, ordered[end]!) === 0) end += 1
    const routable: LayoutGraphResult[] = []
    for (const placement of ordered.slice(start, end)) {
      try {
        const routing = routeGraph(placement.routeInput)
        routable.push({placement, routing, candidates: {generated: placements.length, routable: 0}})
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("NO_LEGAL_ROUTE ")) throw error
      }
    }
    if (routable.length > 0) {
      const best = routable.sort(compareRoutingQuality)[0]!
      return {...best, candidates: {generated: placements.length, routable: routable.length}}
    }
    start = end
  }
  throw new Error(
    `NO_LEGAL_LAYOUT: ${placements.length} generated placements provide no legal route graph`,
  )
}

/** Product adapter: intrinsic card measurement in, pure fixed-point core out. */
export class MetaForNodeSystemLayouter {
  constructor(private readonly options: MetaForNodeSystemLayoutOptions = {}) {}

  layout(
    document: NodeSystemDocument,
    request: MetaForNodeSystemLayoutRequest,
  ): PositionedNodeSystem {
    validateNodeSystemDocument(document)
    const viewport = {
      width: positiveViewport(request.viewport.width, "viewport width"),
      height: positiveViewport(request.viewport.height, "viewport height"),
    }
    const measureText = memoizedTextMeasurer(this.options.measureText)
    const first = this.layoutPass(document, viewport, measureText)
    const direction: NodeSystemLayoutDirection = viewport.width >= viewport.height ? "RIGHT" : "DOWN"
    const orderedDocument = orderNodeSystemPortFactsForLayout(document, first.positioned, direction)
    if (orderedDocument === document) return first.positioned

    try {
      const ordered = this.layoutPass(orderedDocument, viewport, measureText)
      return compareRoutingObjective(ordered.result, first.result) < 0
        ? ordered.positioned
        : first.positioned
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("NO_LEGAL_LAYOUT")) {
        return first.positioned
      }
      throw error
    }
  }

  private layoutPass(
    document: NodeSystemDocument,
    viewport: Readonly<{width: number; height: number}>,
    measureText?: NodeSystemTextMeasurer,
  ): LayoutPass {
    const index = validateNodeSystemDocument(document)
    const nodes = [...document.nodes].sort(compareOrdered)
    const edges = [...document.edges].sort(compareOrdered)
    const cards = new Map(nodes.map((node) => {
      const size = measureNodeSystemCard(node, measureText)
      return [node.id, {
        size,
        plan: planNodeSystemCard(node, {x: 0, y: 0, w: size.width, h: size.height}, 1, measureText),
      }] as const
    }))
    const routePorts = new Map<string, IntrinsicPort>()
    const routeEdges: RouteEdge[] = edges.map((edge) => {
      const source = endpointPort(edge, "source", index.ports)
      const target = endpointPort(edge, "target", index.ports)
      addRoutePort(routePorts, edge.source.nodeId, source, cards, "out", "EAST", edge.id)
      addRoutePort(routePorts, edge.target.nodeId, target, cards, "in", "WEST", edge.id)
      return {
        id: edge.id,
        sourcePortId: enginePortId(edge.source.nodeId, edge.source.portId),
        targetPortId: enginePortId(edge.target.nodeId, edge.target.portId),
      }
    })
    const clearance = fixed(positiveOption(this.options.clearance, NODE_SYSTEM_PORT_PITCH))
    const placementInput: PlacementInput = {
      unitsPerPixel: UNITS_PER_PIXEL,
      clearance,
      viewport,
      padding: Math.max(fixed(positiveOption(this.options.padding, NODE_SYSTEM_PORT_PITCH)), clearance * 2),
      nodeSpacing: Math.max(fixed(positiveOption(this.options.nodeSpacing, NODE_SYSTEM_PORT_PITCH)), clearance),
      layerSpacing: Math.max(fixed(positiveOption(this.options.layerSpacing, NODE_SYSTEM_PORT_PITCH)), clearance),
      outerPadding: Math.max(fixed(positiveOption(this.options.padding, NODE_SYSTEM_PORT_PITCH)), clearance),
      nodes: nodes.map((node) => {
        const size = cards.get(node.id)!.size
        return {
          id: node.id,
          ...(node.parentId === undefined ? {} : {parentId: node.parentId}),
          size: {w: fixed(size.width), h: fixed(size.height)},
        }
      }),
      ports: [...routePorts.values()].sort((left, right) => compareIds(left.id, right.id)),
      edges: routeEdges,
    }
    const result = layoutGraph(placementInput)
    const positioned = positionedDocument(
      document,
      nodes,
      edges,
      result,
      nodeSystemGeometryKey(document, measureText),
      measureText,
    )
    validatePositionedNodeSystem(positioned)
    return {positioned, result}
  }

}

/**
 * Presentation-only ordering pass. It moves only connected socket-bearing fact
 * rows between their existing slots; domain facts, port identities and edges
 * remain unchanged.
 */
export function orderNodeSystemPortFactsForLayout(
  document: NodeSystemDocument,
  positioned: PositionedNodeSystem,
  _direction: NodeSystemLayoutDirection,
): NodeSystemDocument {
  const positionedNodes = new Map(positioned.nodes.map((entry) => [entry.node.id, entry]))
  const parameterByPort = new Map<string, string>()
  for (const node of document.nodes) {
    for (const port of node.ports ?? []) {
      parameterByPort.set(enginePortId(node.id, port.id), port.parameterId)
    }
  }

  const coordinates = new Map<string, number[]>()
  const addCoordinate = (
    nodeId: string,
    portId: string,
    counterpartNodeId: string,
    counterpartPortId: string,
  ): void => {
    const parameterId = parameterByPort.get(enginePortId(nodeId, portId))
    const counterpart = positionedNodes.get(counterpartNodeId)
    if (parameterId === undefined || counterpart === undefined) return
    // Every semantic endpoint is on WEST/EAST in both responsive directions,
    // so parameter rows must follow the exact longitudinal Y of the opposite
    // socket. Sorting DOWN by node X leaves avoidable vertical doglegs intact.
    const coordinate = counterpart.ports.find(({port}) => port.id === counterpartPortId)?.center.y
    if (coordinate === undefined) return
    const key = enginePortId(nodeId, parameterId)
    const values = coordinates.get(key) ?? []
    values.push(coordinate)
    coordinates.set(key, values)
  }
  for (const edge of [...document.edges].sort(compareOrdered)) {
    addCoordinate(edge.source.nodeId, edge.source.portId, edge.target.nodeId, edge.target.portId)
    addCoordinate(edge.target.nodeId, edge.target.portId, edge.source.nodeId, edge.source.portId)
  }

  let changed = false
  const nodes = document.nodes.map((node): NodeSystemNode => {
    const facts = node.facts ?? []
    const connectedSlots = facts.flatMap((fact, index) =>
      coordinates.has(enginePortId(node.id, fact.id)) ? [index] : [])
    if (connectedSlots.length < 2) return node
    const positionedNode = positionedNodes.get(node.id)
    if (positionedNode === undefined) return node
    const portRows = new Map<string, number[]>()
    for (const entry of positionedNode.ports) {
      const parameterId = parameterByPort.get(enginePortId(node.id, entry.port.id))
      if (parameterId === undefined) continue
      const rows = portRows.get(parameterId) ?? []
      rows.push(entry.center.y)
      portRows.set(parameterId, rows)
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

type RowAssignment = Readonly<{
  mismatches: number
  distance: number
  key: string
  facts: readonly number[]
}>

function assignFactsToRows(
  nodeId: string,
  facts: readonly NonNullable<NodeSystemNode["facts"]>[number][],
  slotYs: readonly number[],
  coordinates: ReadonlyMap<string, readonly number[]>,
): readonly NonNullable<NodeSystemNode["facts"]>[number][] {
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

function compareRoutingObjective(left: LayoutGraphResult, right: LayoutGraphResult): number {
  const leftMetrics = left.routing.metrics
  const rightMetrics = right.routing.metrics
  const pairs = [
    [leftMetrics.totalTurns, rightMetrics.totalTurns],
    [leftMetrics.maxTurns, rightMetrics.maxTurns],
    [leftMetrics.totalManhattan, rightMetrics.totalManhattan],
    [leftMetrics.maxManhattan, rightMetrics.maxManhattan],
    [leftMetrics.maxDetour, rightMetrics.maxDetour],
    [leftMetrics.crossings, rightMetrics.crossings],
  ] as const
  for (const [leftValue, rightValue] of pairs) {
    if (leftValue !== rightValue) return leftValue - rightValue
  }
  return 0
}

function endpointPort(
  edge: NodeSystemEdge,
  role: "source" | "target",
  ports: ReadonlyMap<string, ReadonlyMap<string, NodeSystemPort>>,
): NodeSystemPort {
  const endpoint = edge[role]
  const port = ports.get(endpoint.nodeId)?.get(endpoint.portId)
  if (port === undefined) throw new Error(`Unknown ${role} port for edge ${edge.id}`)
  return port
}

function addRoutePort(
  routePorts: Map<string, IntrinsicPort>,
  nodeId: string,
  port: NodeSystemPort,
  cards: ReadonlyMap<string, Readonly<{plan: ReturnType<typeof planNodeSystemCard>}>>,
  direction: "in" | "out",
  side: "WEST" | "EAST",
  edgeId: string,
): void {
  const actualSide = port.side ?? (port.direction === "in" ? "left" : "right")
  const requiredSide = side === "WEST" ? "left" : "right"
  if (port.direction !== direction || actualSide !== requiredSide) {
    throw new Error(`${direction === "out" ? "source" : "target"} must be ${direction}/${side}: ${edgeId}`)
  }
  const id = enginePortId(nodeId, port.id)
  const marker = cards.get(nodeId)?.plan.ports.find((entry) => entry.port.id === port.id)?.marker
  if (marker === undefined) throw new Error(`Card omitted parameter socket: ${nodeId}/${port.id}`)
  const candidate: IntrinsicPort = {
    id,
    nodeId,
    offsetY: fixed(marker.y + marker.h / 2),
    side,
    direction,
  }
  const existing = routePorts.get(id)
  if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(candidate)) {
    throw new Error(`Conflicting endpoint role: ${nodeId}/${port.id}`)
  }
  routePorts.set(id, candidate)
}

function positionedDocument(
  document: NodeSystemDocument,
  nodes: readonly NodeSystemNode[],
  edges: readonly NodeSystemEdge[],
  result: LayoutGraphResult,
  geometryKey: string,
  measureText?: NodeSystemTextMeasurer,
): PositionedNodeSystem {
  const rects = new Map(result.placement.nodes.map((node) => [node.id, {
    x: pixels(node.rect.x),
    y: pixels(node.rect.y),
    w: pixels(node.rect.w),
    h: pixels(node.rect.h),
  }]))
  const exactEndpointCenters = new Map(result.placement.ports.map((port) => [port.id, {
    x: pixels(port.center.x),
    y: pixels(port.center.y),
  }]))
  const positionedNodes = nodes.map((node): PositionedNodeSystemNode => {
    const rect = required(rects.get(node.id), `Layout omitted node: ${node.id}`)
    const card = planNodeSystemCard(node, rect, 1, measureText)
    const ports = (node.ports ?? []).map((port): PositionedNodeSystemPort => {
      const marker = required(
        card.ports.find((entry) => entry.port.id === port.id)?.marker,
        `Card omitted positioned socket: ${node.id}/${port.id}`,
      )
      return {
        port,
        center: exactEndpointCenters.get(enginePortId(node.id, port.id)) ?? {
          x: marker.x + marker.w / 2,
          y: marker.y + marker.h / 2,
        },
      }
    })
    return {node, rect, ports}
  })
  const sections = new Map(result.routing.sections.map((section) => [section.edgeId, section]))
  const positionedEdges = edges.map((edge): PositionedNodeSystemEdge => {
    const section = required(sections.get(edge.id), `Layout omitted edge: ${edge.id}`)
    return {
      edge,
      points: [section.startPoint, ...section.bendPoints, section.endPoint].map((point) => ({
        x: pixels(point.x),
        y: pixels(point.y),
      })),
    }
  })
  const bounds = result.placement.bounds
  return {
    geometryKey,
    bounds: {x: pixels(bounds.x), y: pixels(bounds.y), w: pixels(bounds.w), h: pixels(bounds.h)},
    nodes: positionedNodes,
    edges: positionedEdges,
    ...(document.revision === undefined ? {} : {revision: document.revision}),
  }
}

function enginePortId(nodeId: string, portId: string): string {
  return `${nodeId}\u0000${portId}`
}

function fixed(value: number): number {
  const result = Math.round(value * UNITS_PER_PIXEL)
  if (!Number.isSafeInteger(result)) throw new Error(`Geometry exceeds fixed-point range: ${value}`)
  return result
}

function pixels(value: number): number {
  return value / UNITS_PER_PIXEL
}

function positiveViewport(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`)
  return Math.max(1, Math.round(value))
}

function positiveOption(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

function compareOrdered<T extends {id: string; order?: number}>(left: T, right: T): number {
  return (left.order ?? 0) - (right.order ?? 0) || compareIds(left.id, right.id)
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message)
  return value
}

export {diagnoseRouteGraph, routeGraph, validateRouteGraphResult} from "./route-graph.ts"
export {placeGraph, placementCandidates, validatePlacement} from "./place-graph.ts"
export type {
  RouteGraphInput,
  RouteGraphResult,
  RouteMetrics,
  RouteSection,
} from "./route-graph.ts"
export type {PlacementInput, PlacementResult} from "./place-graph.ts"
