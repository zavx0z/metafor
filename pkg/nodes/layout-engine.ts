import type {
  LayoutEdge,
  LayoutGraph,
  LayoutPort,
  LayoutResult,
  LayoutWorkerClient,
} from "@nodes/layout"
import {layout as calculateLayout} from "@nodes/layout"
import type {
  NodeSystemDocument,
  NodeSystemEdge,
  NodeSystemNode,
  NodeSystemPort,
  PositionedNodeSystem,
  PositionedNodeSystemEdge,
  PositionedNodeSystemNode,
  PositionedNodeSystemPort,
} from "./types/model.ts"
import type {
  MetaForNodeSystemLayoutOptions,
  MetaForNodeSystemLayoutRequest,
  NodeSystemLayoutDirection,
} from "./types/engine.ts"
import type {NodeSystemTextMeasurer} from "./types/card.ts"
import {
  NODE_SYSTEM_PORT_PITCH,
  measureNodeSystemCard,
  measureNodeSystemCardContentHeight,
  memoizedTextMeasurer,
  nodeSystemGeometryKey,
  planNodeSystemCard,
} from "@nodes/ui/card-layout"
import {validateNodeSystemDocument, validatePositionedNodeSystem} from "./validation.ts"

type LayoutPass = Readonly<{
  positioned: PositionedNodeSystem
  result: LayoutResult
}>
/** Presentation adapter: измеряет UI document и материализует готовую geometry. */
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
    const prepared = prepareLayoutPass(document, viewport, this.options, measureText)
    return materializeLayoutPass(prepared, calculateLayout(prepared.graph))
  }
}

/**
 * Product adapter: measurement stays on main thread, while both placement and
 * routing run through the minimal {@link LayoutWorkerClient} protocol.
 */
export class MetaForNodeSystemWorkerLayouter {
  constructor(
    private readonly worker: LayoutWorkerClient,
    private readonly options: MetaForNodeSystemLayoutOptions = {},
  ) {}

  async layout(
    document: NodeSystemDocument,
    request: MetaForNodeSystemLayoutRequest,
    generation: number,
  ): Promise<PositionedNodeSystem> {
    validateNodeSystemDocument(document)
    const viewport = {
      width: positiveViewport(request.viewport.width, "viewport width"),
      height: positiveViewport(request.viewport.height, "viewport height"),
    }
    const measureText = memoizedTextMeasurer(this.options.measureText)
    const first = await this.layoutPass(document, viewport, measureText, generation)
    const orderedDocument = orderNodeSystemPortFactsForLayout(
      document,
      first.positioned,
      first.result.direction,
    )
    if (orderedDocument === document) return first.positioned
    try {
      const ordered = await this.layoutPass(orderedDocument, viewport, measureText, generation)
      return compareRoutingObjective(ordered.result, first.result) < 0
        ? ordered.positioned
        : first.positioned
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("NO_LEGAL_LAYOUT")) return first.positioned
      throw error
    }
  }

  private async layoutPass(
    document: NodeSystemDocument,
    viewport: Readonly<{width: number; height: number}>,
    measureText: NodeSystemTextMeasurer | undefined,
    generation: number,
  ): Promise<LayoutPass> {
    const prepared = prepareLayoutPass(document, viewport, this.options, measureText)
    const response = await this.worker.layout({generation, graph: prepared.graph})
    return materializeLayoutPass(prepared, response.result)
  }
}

type PreparedLayoutPass = Readonly<{
  document: NodeSystemDocument
  nodes: readonly NodeSystemNode[]
  edges: readonly NodeSystemEdge[]
  graph: LayoutGraph
  geometryKey: string
  measureText?: NodeSystemTextMeasurer
}>

function prepareLayoutPass(
  document: NodeSystemDocument,
  viewport: Readonly<{width: number; height: number}>,
  options: MetaForNodeSystemLayoutOptions,
  measureText?: NodeSystemTextMeasurer,
): PreparedLayoutPass {
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
  const ports = new Map<string, LayoutPort>()
  const layoutEdges: LayoutEdge[] = edges.map((edge) => {
    const source = endpointPort(edge, "source", index.ports)
    const target = endpointPort(edge, "target", index.ports)
    addLayoutPort(ports, edge.source.nodeId, source, cards, "out", "EAST", edge.id)
    addLayoutPort(ports, edge.target.nodeId, target, cards, "in", "WEST", edge.id)
    return {
      id: edge.id,
      sourcePortId: enginePortId(edge.source.nodeId, edge.source.portId),
      targetPortId: enginePortId(edge.target.nodeId, edge.target.portId),
    }
  })
  const clearance = positiveOption(options.clearance, NODE_SYSTEM_PORT_PITCH)
  const graph: LayoutGraph = {
    viewport,
    layoutOptions: {
      clearance,
      spacing: Math.max(positiveOption(options.nodeSpacing, NODE_SYSTEM_PORT_PITCH), clearance),
      layerSpacing: Math.max(positiveOption(options.layerSpacing, NODE_SYSTEM_PORT_PITCH), clearance),
      padding: positiveOption(options.padding, NODE_SYSTEM_PORT_PITCH),
    },
    nodes: nodes.map((node) => {
      const size = cards.get(node.id)!.size
      return {
        id: node.id,
        ...(node.parentId === undefined ? {} : {parentId: node.parentId}),
        width: size.width,
        height: size.height,
        contentHeight: measureNodeSystemCardContentHeight(node),
      }
    }),
    ports: [...ports.values()].sort((left, right) => compareIds(left.id, right.id)),
    edges: layoutEdges,
  }
  return {
    document,
    nodes,
    edges,
    graph,
    geometryKey: nodeSystemGeometryKey(document, measureText),
    ...(measureText === undefined ? {} : {measureText}),
  }
}

function materializeLayoutPass(prepared: PreparedLayoutPass, result: LayoutResult): LayoutPass {
  const positioned = positionedDocument(
    prepared.document,
    prepared.nodes,
    prepared.edges,
    result,
    prepared.geometryKey,
    prepared.measureText,
  )
  validatePositionedNodeSystem(positioned)
  return {positioned, result}
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

function compareRoutingObjective(left: LayoutResult, right: LayoutResult): number {
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
          if (!properPerpendicularLayoutCrossing(left.points[li - 1]!, left.points[li]!, right.points[ri - 1]!, right.points[ri]!)) continue
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

function addLayoutPort(
  layoutPorts: Map<string, LayoutPort>,
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
  const candidate: LayoutPort = {
    id,
    nodeId,
    y: marker.y + marker.h / 2,
  }
  const existing = layoutPorts.get(id)
  if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(candidate)) {
    throw new Error(`Conflicting endpoint role: ${nodeId}/${port.id}`)
  }
  layoutPorts.set(id, candidate)
}

function positionedDocument(
  document: NodeSystemDocument,
  nodes: readonly NodeSystemNode[],
  edges: readonly NodeSystemEdge[],
  result: LayoutResult,
  geometryKey: string,
  measureText?: NodeSystemTextMeasurer,
): PositionedNodeSystem {
  const rects = new Map(result.nodes.map((node) => [node.id, {
    x: node.x,
    y: node.y,
    w: node.width,
    h: node.height,
  }]))
  const exactEndpointCenters = new Map(result.ports.map((port) => [port.id, {
    x: port.x,
    y: port.y,
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
  const sections = new Map(result.edges.map((edge) => [edge.id, edge.sections[0]]))
  const positionedEdges = edges.map((edge): PositionedNodeSystemEdge => {
    const section = required(sections.get(edge.id), `Layout omitted edge: ${edge.id}`)
    return {
      edge,
      points: [section.startPoint, ...section.bendPoints, section.endPoint],
    }
  })
  return {
    geometryKey,
    bounds: {
      x: result.bounds.x,
      y: result.bounds.y,
      w: result.bounds.width,
      h: result.bounds.height,
    },
    nodes: positionedNodes,
    edges: positionedEdges,
    ...(document.revision === undefined ? {} : {revision: document.revision}),
  }
}

function enginePortId(nodeId: string, portId: string): string {
  return `${nodeId}\u0000${portId}`
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
