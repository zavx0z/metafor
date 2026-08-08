import ELK from "elkjs/lib/elk-api.js"
import elkWorkerSource from "elkjs/lib/elk-worker.min.js" with {type: "text"}
import type {
  ElkEdgeSection,
  ElkExtendedEdge,
  ElkNode,
  ElkPoint,
  ElkPort,
} from "elkjs/lib/elk-api.js"
import type {
  NodeSystemDocument,
  NodeSystemEdge,
  NodeSystemEndpoint,
  NodeSystemNode,
  NodeSystemPoint,
  NodeSystemPort,
  PositionedNodeSystem,
  PositionedNodeSystemEdge,
  PositionedNodeSystemNode,
  PositionedNodeSystemPort,
} from "./model.ts"
import {
  measureNodeSystemCard,
  memoizedTextMeasurer,
  nodeSystemGeometryKey,
  planNodeSystemCard,
  type NodeSystemTextMeasurer,
} from "./card-layout.ts"
import {validateNodeSystemDocument} from "./validation.ts"

export type NodeSystemLayoutDirection = "RIGHT" | "DOWN" | "LEFT" | "UP"

export type ElkNodeSystemLayoutOptions = Readonly<{
  direction?: NodeSystemLayoutDirection
  nodeSpacing?: number
  layerSpacing?: number
  padding?: number
  /** Exact TrueType/text measurer supplied by the rendering surface when live. */
  measureText?: NodeSystemTextMeasurer
}>

export interface NodeSystemLayouter {
  layout(document: NodeSystemDocument): Promise<PositionedNodeSystem>
}

const PORT_SIZE = 8

/**
 * One deterministic layered layout. Input order never controls the result:
 * explicit `order` and then stable IDs define ELK model order.
 */
export class ElkNodeSystemLayouter implements NodeSystemLayouter {
  readonly #workerUrls: string[] = []
  readonly #elk = new ELK({
    workerFactory: () => {
      const url = URL.createObjectURL(new Blob([elkWorkerSource], {type: "text/javascript"}))
      this.#workerUrls.push(url)
      return new Worker(url)
    },
  })

  constructor(private readonly options: ElkNodeSystemLayoutOptions = {}) {}

  async layout(document: NodeSystemDocument): Promise<PositionedNodeSystem> {
    validateNodeSystemDocument(document)
    const measureText = memoizedTextMeasurer(this.options.measureText)
    const nodes = [...document.nodes].sort(compareOrdered)
    const edges = [...document.edges].sort(compareOrdered)
    const graph: ElkNode = {
      id: "node-system-root",
      children: nodes.map((node) => toElkNode(node, measureText)),
      edges: edges.map(toElkEdge),
      layoutOptions: rootLayoutOptions(this.options),
    }
    const result = await this.#elk.layout(graph)
    return positionedDocument(
      document,
      nodes,
      edges,
      result,
      nodeSystemGeometryKey(document, measureText),
      measureText,
    )
  }

  dispose(): void {
    this.#elk.terminateWorker()
    for (const url of this.#workerUrls.splice(0)) URL.revokeObjectURL(url)
  }
}

function rootLayoutOptions(options: ElkNodeSystemLayoutOptions): Record<string, string> {
  const direction = options.direction ?? "RIGHT"
  const nodeSpacing = finitePositive(options.nodeSpacing, 46)
  const layerSpacing = finitePositive(options.layerSpacing, 86)
  const padding = finitePositive(options.padding, 40)
  return {
    "elk.algorithm": "layered",
    "elk.direction": direction,
    "elk.edgeRouting": "SPLINES",
    "elk.padding": `[top=${padding},left=${padding},bottom=${padding},right=${padding}]`,
    "elk.spacing.nodeNode": String(nodeSpacing),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
    "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
  }
}

function toElkNode(node: NodeSystemNode, measureText?: NodeSystemTextMeasurer): ElkNode {
  const size = measureNodeSystemCard(node, measureText)
  const card = planNodeSystemCard(node, {x: 0, y: 0, w: size.width, h: size.height}, 1, measureText)
  return {
    id: node.id,
    width: size.width,
    height: size.height,
    ports: card.ports.map(({port, marker}): ElkPort => ({
      id: elkPortId(node.id, port.id),
      x: marker.x + marker.w / 2 - PORT_SIZE / 2,
      y: marker.y + marker.h / 2 - PORT_SIZE / 2,
      width: PORT_SIZE,
      height: PORT_SIZE,
      layoutOptions: {
        "elk.port.side": portSide(port),
        "elk.port.borderOffset": String(-PORT_SIZE / 2),
      },
    })),
    layoutOptions: {
      "elk.portConstraints": "FIXED_POS",
    },
  }
}

function toElkEdge(edge: NodeSystemEdge): ElkExtendedEdge {
  return {
    id: edge.id,
    sources: [elkEndpointId(edge.source)],
    targets: [elkEndpointId(edge.target)],
  }
}

function positionedDocument(
  document: NodeSystemDocument,
  sourceNodes: readonly NodeSystemNode[],
  sourceEdges: readonly NodeSystemEdge[],
  graph: ElkNode,
  geometryKey: string,
  measureText?: NodeSystemTextMeasurer,
): PositionedNodeSystem {
  const elkNodes = new Map((graph.children ?? []).map((node) => [node.id, node]))
  const positionedNodes = sourceNodes.map((node): PositionedNodeSystemNode => {
    const laidOut = required(elkNodes.get(node.id), `ELK omitted node: ${node.id}`)
    const x = finite(laidOut.x, `ELK returned invalid x for node: ${node.id}`)
    const y = finite(laidOut.y, `ELK returned invalid y for node: ${node.id}`)
    const size = measureNodeSystemCard(node, measureText)
    const width = finitePositive(laidOut.width, size.width)
    const height = finitePositive(laidOut.height, size.height)
    const elkPorts = new Map((laidOut.ports ?? []).map((port) => [port.id, port]))
    const ports = [...(node.ports ?? [])]
      .sort((left, right) => compareIds(left.id, right.id))
      .map((port): PositionedNodeSystemPort => {
        const laidOutPort = required(elkPorts.get(elkPortId(node.id, port.id)), `ELK omitted port: ${node.id}/${port.id}`)
        return {
          port,
          center: {
            x: x + finite(laidOutPort.x, `ELK returned invalid port x: ${node.id}/${port.id}`) + finitePositive(laidOutPort.width, PORT_SIZE) / 2,
            y: y + finite(laidOutPort.y, `ELK returned invalid port y: ${node.id}/${port.id}`) + finitePositive(laidOutPort.height, PORT_SIZE) / 2,
          },
        }
      })
    return {node, rect: {x, y, w: width, h: height}, ports}
  })

  const byNode = new Map(positionedNodes.map((entry) => [entry.node.id, entry]))
  const elkEdges = new Map((graph.edges ?? []).map((edge) => [edge.id, edge]))
  const positionedEdges = sourceEdges.map((edge): PositionedNodeSystemEdge => {
    const laidOut = required(elkEdges.get(edge.id), `ELK omitted edge: ${edge.id}`)
    const points = edgePoints(laidOut.sections ?? [], edge, byNode)
    return {edge, points}
  })

  const result: PositionedNodeSystem = {
    geometryKey,
    bounds: {
      x: finite(graph.x ?? 0, "ELK returned invalid graph x"),
      y: finite(graph.y ?? 0, "ELK returned invalid graph y"),
      w: finitePositive(graph.width, contentExtent(positionedNodes, "x")),
      h: finitePositive(graph.height, contentExtent(positionedNodes, "y")),
    },
    nodes: positionedNodes,
    edges: positionedEdges,
    ...(document.revision === undefined ? {} : {revision: document.revision}),
  }
  return result
}

function edgePoints(
  sections: readonly ElkEdgeSection[],
  edge: NodeSystemEdge,
  nodes: ReadonlyMap<string, PositionedNodeSystemNode>,
): readonly NodeSystemPoint[] {
  const ordered = [...sections].sort((left, right) => compareIds(left.id, right.id))
  if (ordered.length === 0) return [endpointCenter(edge.source, nodes), endpointCenter(edge.target, nodes)]
  const points: NodeSystemPoint[] = []
  for (const section of ordered) {
    appendPoint(points, section.startPoint)
    for (const point of section.bendPoints ?? []) appendPoint(points, point)
    appendPoint(points, section.endPoint)
  }
  return points
}

function endpointCenter(
  endpoint: NodeSystemEndpoint,
  nodes: ReadonlyMap<string, PositionedNodeSystemNode>,
): NodeSystemPoint {
  const node = required(nodes.get(endpoint.nodeId), `Missing positioned node: ${endpoint.nodeId}`)
  if (endpoint.portId !== undefined) {
    return required(
      node.ports.find((entry) => entry.port.id === endpoint.portId),
      `Missing positioned port: ${endpoint.nodeId}/${endpoint.portId}`,
    ).center
  }
  return {x: node.rect.x + node.rect.w / 2, y: node.rect.y + node.rect.h / 2}
}

function appendPoint(points: NodeSystemPoint[], point: ElkPoint): void {
  const next = {
    x: finite(point.x, "ELK returned invalid edge x"),
    y: finite(point.y, "ELK returned invalid edge y"),
  }
  const previous = points.at(-1)
  if (previous?.x === next.x && previous.y === next.y) return
  points.push(next)
}

function elkEndpointId(endpoint: NodeSystemEndpoint): string {
  return endpoint.portId === undefined ? endpoint.nodeId : elkPortId(endpoint.nodeId, endpoint.portId)
}

function elkPortId(nodeId: string, portId: string): string {
  return `${nodeId}\u0000${portId}`
}

function portSide(port: NodeSystemPort): "WEST" | "EAST" | "SOUTH" {
  if (port.direction === "in") return "WEST"
  if (port.direction === "out") return "EAST"
  return "SOUTH"
}

function contentExtent(nodes: readonly PositionedNodeSystemNode[], axis: "x" | "y"): number {
  if (nodes.length === 0) return 1
  return Math.max(...nodes.map(({rect}) => axis === "x" ? rect.x + rect.w : rect.y + rect.h))
}

function compareOrdered<T extends {id: string; order?: number}>(left: T, right: T): number {
  return (left.order ?? 0) - (right.order ?? 0) || compareIds(left.id, right.id)
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function finite(value: number | undefined, message: string): number {
  if (value === undefined || !Number.isFinite(value)) throw new Error(message)
  return value
}

function finitePositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message)
  return value
}
