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
  NODE_SYSTEM_PORT_PITCH,
  nodeSystemGeometryKey,
  planNodeSystemCard,
  type NodeSystemTextMeasurer,
} from "./card-layout.ts"
import {
  indexNodeSystemContainment,
  type NodeSystemContainmentIndex,
} from "./containment.ts"
import {validateNodeSystemDocument} from "./validation.ts"

/** The node-system contract has exactly two responsive ELK layouts. */
export type NodeSystemLayoutDirection = "RIGHT" | "DOWN"

export type ElkNodeSystemLayoutOptions = Readonly<{
  direction?: NodeSystemLayoutDirection
  nodeSpacing?: number
  layerSpacing?: number
  padding?: number
  /** Exact TrueType/text measurer supplied by the rendering surface when live. */
  measureText?: NodeSystemTextMeasurer
}>

export interface NodeSystemLayouter {
  layout(
    document: NodeSystemDocument,
    overrides?: ElkNodeSystemLayoutOptions,
  ): Promise<PositionedNodeSystem>
}

const PORT_SIZE = 8

/**
 * One deterministic compound ELK layout. The adapter only measures intrinsic
 * card content and translates the domain tree into ELK JSON; ELK owns every
 * node position, compound size and edge section.
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

  async layout(
    document: NodeSystemDocument,
    overrides: ElkNodeSystemLayoutOptions = {},
  ): Promise<PositionedNodeSystem> {
    validateNodeSystemDocument(document)
    const options = {...this.options, ...overrides}
    const measureText = memoizedTextMeasurer(options.measureText)
    const nodes = [...document.nodes].sort(compareOrdered)
    const edges = [...document.edges].sort(compareOrdered)
    const containment = indexNodeSystemContainment(nodes)
    const edgesByOwner = indexEdgesByLayoutOwner(edges, containment)
    const graph: ElkNode = {
      id: "node-system-root",
      children: containment.roots.map((node) =>
        toElkNode(node, containment, edgesByOwner, options, measureText)),
      edges: (edgesByOwner.get(null) ?? []).map(toElkEdge),
      layoutOptions: rootLayoutOptions(options),
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
  const padding = positiveOption(options.padding, NODE_SYSTEM_PORT_PITCH)
  return {
    ...parentLayoutOptions(options),
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.json.shapeCoords": "ROOT",
    "elk.json.edgeCoords": "ROOT",
    "elk.padding": elkPadding(padding, padding, padding, padding),
  }
}

/** ELK parent options are assigned at every compound level; they are not CSS inheritance. */
function parentLayoutOptions(options: ElkNodeSystemLayoutOptions): Record<string, string> {
  const nodeSpacing = positiveOption(options.nodeSpacing, NODE_SYSTEM_PORT_PITCH)
  const layerSpacing = positiveOption(options.layerSpacing, NODE_SYSTEM_PORT_PITCH)
  const routeSpacing = NODE_SYSTEM_PORT_PITCH
  const direction = options.direction ?? "RIGHT"
  return {
    "elk.algorithm": "layered",
    "elk.direction": direction,
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.spacing.nodeNode": String(nodeSpacing),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
    "elk.spacing.edgeEdge": String(routeSpacing),
    "elk.layered.spacing.edgeEdgeBetweenLayers": String(routeSpacing),
    "elk.spacing.edgeNode": String(routeSpacing),
    "elk.layered.spacing.edgeNodeBetweenLayers": String(routeSpacing),
    "elk.spacing.portPort": String(Math.max(0, NODE_SYSTEM_PORT_PITCH - PORT_SIZE)),
    "elk.spacing.componentComponent": String(nodeSpacing),
    "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
    "elk.layered.mergeEdges": "false",
    "elk.layered.mergeHierarchyEdges": "false",
    // Order is stable input metadata, not geometry authority. Forcing it while
    // ELK only "prefers" nodes is invalid for cyclic compound graphs and can
    // fail inside crossing minimization.
    "elk.layered.considerModelOrder.strategy": "NONE",
    "elk.layered.crossingMinimization.forceNodeModelOrder": "false",
  }
}

function toElkNode(
  node: NodeSystemNode,
  containment: NodeSystemContainmentIndex,
  edgesByOwner: ReadonlyMap<string | null, readonly NodeSystemEdge[]>,
  options: ElkNodeSystemLayoutOptions,
  measureText?: NodeSystemTextMeasurer,
): ElkNode {
  const size = measureNodeSystemCard(node, measureText)
  const card = planNodeSystemCard(node, {x: 0, y: 0, w: size.width, h: size.height}, 1, measureText)
  const children = containment.childrenByParent.get(node.id) ?? []
  const layoutOptions: Record<string, string> = {
    "elk.portConstraints": "FIXED_POS",
  }
  if (children.length > 0) {
    const padding = positiveOption(options.padding, NODE_SYSTEM_PORT_PITCH)
    Object.assign(layoutOptions, parentLayoutOptions(options))
    // NETWORK_SIMPLEX node placement is a compound-level option. Applying it
    // to the root breaks cyclic DOWN graphs in elkjs; metafor-space keeps the
    // same ownership boundary.
    layoutOptions["elk.layered.nodePlacement.strategy"] = "NETWORK_SIMPLEX"
    layoutOptions["elk.padding"] = elkPadding(size.height + padding, padding, padding, padding)
    layoutOptions["elk.nodeSize.constraints"] = "MINIMUM_SIZE"
    layoutOptions["elk.nodeSize.minimum"] = `(${size.width},${size.height})`
  }
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
    ...(children.length === 0 ? {} : {
      children: children.map((child) =>
        toElkNode(child, containment, edgesByOwner, options, measureText)),
    }),
    ...((edgesByOwner.get(node.id)?.length ?? 0) === 0 ? {} : {
      edges: edgesByOwner.get(node.id)!.map(toElkEdge),
    }),
    layoutOptions,
  }
}

/**
 * ELK edges belong to the lowest graph that contains both endpoint shapes.
 * Keeping every edge at root turns internal transports into hierarchy-crossing
 * routes and needlessly expands their compound owner.
 */
function indexEdgesByLayoutOwner(
  edges: readonly NodeSystemEdge[],
  containment: NodeSystemContainmentIndex,
): ReadonlyMap<string | null, readonly NodeSystemEdge[]> {
  const result = new Map<string | null, NodeSystemEdge[]>()
  for (const edge of edges) {
    const owner = lowestCommonContainer(edge, containment)
    const owned = result.get(owner) ?? []
    owned.push(edge)
    result.set(owner, owned)
  }
  return result
}

function lowestCommonContainer(
  edge: NodeSystemEdge,
  containment: NodeSystemContainmentIndex,
): string | null {
  const sourceAncestors = containerAncestors(edge.source.nodeId, containment.parentByChild)
  const targetAncestors = new Set(containerAncestors(edge.target.nodeId, containment.parentByChild))
  return sourceAncestors.find((nodeId) => targetAncestors.has(nodeId)) ?? null
}

function containerAncestors(
  nodeId: string,
  parentByChild: ReadonlyMap<string, string>,
): readonly string[] {
  const result: string[] = []
  let current = parentByChild.get(nodeId)
  while (current !== undefined) {
    result.push(current)
    current = parentByChild.get(current)
  }
  return result
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
  const sourceById = new Map(sourceNodes.map((node) => [node.id, node]))
  const positionedById = new Map<string, PositionedNodeSystemNode>()
  flattenElkNodes(graph.children ?? [], sourceById, positionedById, measureText)
  const positionedNodes = sourceNodes.map((node) =>
    required(positionedById.get(node.id), `ELK omitted node: ${node.id}`))

  const elkEdges = new Map(collectElkEdges(graph).map((edge) => [edge.id, edge]))
  const positionedEdges = sourceEdges.map((edge): PositionedNodeSystemEdge => {
    const laidOut = required(elkEdges.get(edge.id), `ELK omitted edge: ${edge.id}`)
    const routed = edgePoints(laidOut.sections ?? [])
    if (routed.length < 2) throw new Error(`ELK omitted routed sections for edge: ${edge.id}`)
    return {edge, points: routed}
  })

  return {
    geometryKey,
    bounds: {
      x: finite(graph.x ?? 0, "ELK returned invalid graph x"),
      y: finite(graph.y ?? 0, "ELK returned invalid graph y"),
      w: positiveElkGeometry(graph.width, "ELK returned invalid graph width"),
      h: positiveElkGeometry(graph.height, "ELK returned invalid graph height"),
    },
    nodes: positionedNodes,
    edges: positionedEdges,
    ...(document.revision === undefined ? {} : {revision: document.revision}),
  }
}

function collectElkEdges(graph: ElkNode): readonly ElkExtendedEdge[] {
  return [
    ...(graph.edges ?? []),
    ...(graph.children ?? []).flatMap(collectElkEdges),
  ]
}

function flattenElkNodes(
  nodes: readonly ElkNode[],
  sourceById: ReadonlyMap<string, NodeSystemNode>,
  positionedById: Map<string, PositionedNodeSystemNode>,
  measureText?: NodeSystemTextMeasurer,
): void {
  for (const laidOut of nodes) {
    const node = required(sourceById.get(laidOut.id), `ELK returned unknown node: ${laidOut.id}`)
    const rect = {
      x: finite(laidOut.x, `ELK returned invalid x for node: ${node.id}`),
      y: finite(laidOut.y, `ELK returned invalid y for node: ${node.id}`),
      w: positiveElkGeometry(laidOut.width, `ELK returned invalid width for node: ${node.id}`),
      h: positiveElkGeometry(laidOut.height, `ELK returned invalid height for node: ${node.id}`),
    }
    const elkPorts = new Map((laidOut.ports ?? []).map((port) => [port.id, port]))
    const ports = (node.ports ?? []).map((port): PositionedNodeSystemPort => {
      const laidOutPort = required(
        elkPorts.get(elkPortId(node.id, port.id)),
        `ELK omitted port: ${node.id}/${port.id}`,
      )
      return {
        port,
        center: {
          x: finite(laidOutPort.x, `ELK returned invalid port x: ${node.id}/${port.id}`)
            + positiveElkGeometry(laidOutPort.width, `ELK returned invalid port width: ${node.id}/${port.id}`) / 2,
          y: finite(laidOutPort.y, `ELK returned invalid port y: ${node.id}/${port.id}`)
            + positiveElkGeometry(laidOutPort.height, `ELK returned invalid port height: ${node.id}/${port.id}`) / 2,
        },
      }
    })
    positionedById.set(node.id, {node, rect, ports})
    flattenElkNodes(laidOut.children ?? [], sourceById, positionedById, measureText)
  }
}

function edgePoints(sections: readonly ElkEdgeSection[]): readonly NodeSystemPoint[] {
  const points: NodeSystemPoint[] = []
  for (const section of sections) {
    appendPoint(points, section.startPoint)
    for (const point of section.bendPoints ?? []) appendPoint(points, point)
    appendPoint(points, section.endPoint)
  }
  return points
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
  return elkPortId(endpoint.nodeId, endpoint.portId)
}

function elkPortId(nodeId: string, portId: string): string {
  return `${nodeId}\u0000${portId}`
}

function portSide(port: NodeSystemPort): "WEST" | "EAST" {
  if (port.side === "left") return "WEST"
  if (port.side === "right") return "EAST"
  if (port.direction === "in") return "WEST"
  if (port.direction === "out") return "EAST"
  return "EAST"
}

function elkPadding(top: number, left: number, bottom: number, right: number): string {
  return `[top=${top},left=${left},bottom=${bottom},right=${right}]`
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

function positiveOption(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

function positiveElkGeometry(value: number | undefined, message: string): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) throw new Error(message)
  return value
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message)
  return value
}
