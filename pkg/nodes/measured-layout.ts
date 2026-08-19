import type {
  LayoutEdge,
  LayoutGraph,
  LayoutPort,
  LayoutResult,
} from "@nodes/layout"
import type {
  MeasuredNodeSystem,
  NodeSystemDocument,
  NodeSystemEdge,
  NodeSystemNode,
  NodeSystemPort,
  NodeSystemPortSide,
  PositionedNodeSystem,
  PositionedNodeSystemEdge,
  PositionedNodeSystemNode,
  PositionedNodeSystemPort,
} from "nodes/types"
import {
  validateMeasuredNodeSystem,
  validateNodeSystemDocument,
  validatePositionedNodeSystem,
} from "nodes/validation"

export type MeasuredNodeSystemLayoutOptions = Readonly<{
  clearance?: number
  nodeSpacing?: number
  layerSpacing?: number
  padding?: number
}>

export type MeasuredNodeSystemLayoutRequest = Readonly<{
  viewport: Readonly<{width: number; height: number}>
}>

/** Default numeric rhythm for a measured graph when its presentation supplies no override. */
export const DEFAULT_MEASURED_NODE_SYSTEM_SPACING = 28

export type MeasuredLayoutPortRole = Readonly<{
  edgeId: string
  role: "source" | "target"
}>

export type MeasuredLayoutPortContext = Readonly<{
  id: string
  nodeId: string
  layoutNodeId: string
  port: NodeSystemPort
  offsetY: number
  roles: readonly MeasuredLayoutPortRole[]
}>

export type ProjectedMeasuredLayoutGraph<TPort extends LayoutPort = LayoutPort> =
  Readonly<Omit<LayoutGraph, "ports"> & {ports: readonly TPort[]}>

export type PreparedMeasuredNodeSystemLayout<
  TNode extends NodeSystemNode = NodeSystemNode,
  TEdge extends NodeSystemEdge = NodeSystemEdge,
  TPort extends LayoutPort = LayoutPort,
> = Readonly<{
  document: NodeSystemDocument<TNode, TEdge>
  measured: MeasuredNodeSystem
  nodes: readonly TNode[]
  edges: readonly TEdge[]
  graph: ProjectedMeasuredLayoutGraph<TPort>
  layoutNodeIdByNodeId: ReadonlyMap<string, string>
  layoutEdgeIdByEdgeId: ReadonlyMap<string, string>
}>

/**
 * Builds the policy-neutral numeric graph boundary once. The supplied mapper
 * resolves only policy-owned socket fields; identity, measurement and edge
 * projection remain shared by fixed, adaptive and non-Card consumers.
 */
export function prepareMeasuredNodeSystemLayout<
  TNode extends NodeSystemNode,
  TEdge extends NodeSystemEdge,
  TPort extends LayoutPort,
>(
  document: NodeSystemDocument<TNode, TEdge>,
  measured: MeasuredNodeSystem,
  request: MeasuredNodeSystemLayoutRequest,
  options: MeasuredNodeSystemLayoutOptions,
  projectPort: (context: MeasuredLayoutPortContext) => TPort,
): PreparedMeasuredNodeSystemLayout<TNode, TEdge, TPort> {
  const documentIndex = validateNodeSystemDocument(document)
  validateMeasuredNodeSystem(measured)
  validateMeasuredTopology(document, measured)

  const viewport = {
    width: positiveViewport(request.viewport.width, "viewport width"),
    height: positiveViewport(request.viewport.height, "viewport height"),
  }
  const nodes = [...document.nodes].sort(compareOrdered)
  const edges = [...document.edges].sort(compareOrdered)
  const layoutNodeIdByNodeId = new Map(nodes.map((node) => [node.id, node.layoutId ?? node.id]))
  const layoutEdgeIdByEdgeId = stableLayoutEdgeIds(edges, layoutNodeIdByNodeId)
  const measuredNodes = new Map(measured.nodes.map((entry) => [entry.node.id, entry]))
  const rolesByPort = connectedPortRoles(edges)
  const ports = [...rolesByPort.entries()]
    .sort(([left], [right]) => compareIds(left, right))
    .map(([endpointId, roles]) => {
      const [nodeId, portId] = splitEndpointId(endpointId)
      const layoutNodeId = required(
        layoutNodeIdByNodeId.get(nodeId),
        `Missing endpoint layout identity: ${nodeId}/${portId}`,
      )
      const port = required(
        documentIndex.ports.get(nodeId)?.get(portId),
        `Missing measured endpoint: ${nodeId}/${portId}`,
      )
      const measuredPort = required(
        measuredNodes.get(nodeId)?.ports.find((entry) => entry.port.id === portId),
        `Measurement omitted socket: ${nodeId}/${portId}`,
      )
      return projectPort({
        id: enginePortId(layoutNodeId, portId),
        nodeId,
        layoutNodeId,
        port: measuredPort.port,
        offsetY: measuredPort.offsetY,
        roles,
      })
    })

  const clearance = positiveOption(options.clearance, DEFAULT_MEASURED_NODE_SYSTEM_SPACING)
  const graph: ProjectedMeasuredLayoutGraph<TPort> = {
    viewport,
    layoutOptions: {
      clearance,
      spacing: Math.max(positiveOption(options.nodeSpacing, DEFAULT_MEASURED_NODE_SYSTEM_SPACING), clearance),
      layerSpacing: Math.max(positiveOption(options.layerSpacing, DEFAULT_MEASURED_NODE_SYSTEM_SPACING), clearance),
      padding: positiveOption(options.padding, DEFAULT_MEASURED_NODE_SYSTEM_SPACING),
    },
    nodes: nodes.map((node) => {
      const entry = required(measuredNodes.get(node.id), `Missing measured node: ${node.id}`)
      return {
        id: required(layoutNodeIdByNodeId.get(node.id), `Missing node layout identity: ${node.id}`),
        ...(node.parentId === undefined ? {} : {
          parentId: required(layoutNodeIdByNodeId.get(node.parentId), `Missing parent layout identity: ${node.id}`),
        }),
        width: entry.width,
        height: entry.height,
        contentHeight: entry.contentHeight,
      }
    }),
    ports,
    edges: edges.map((edge): LayoutEdge => ({
      id: required(layoutEdgeIdByEdgeId.get(edge.id), `Missing edge layout identity: ${edge.id}`),
      sourcePortId: enginePortId(
        required(layoutNodeIdByNodeId.get(edge.source.nodeId), `Missing source node: ${edge.id}`),
        edge.source.portId,
      ),
      targetPortId: enginePortId(
        required(layoutNodeIdByNodeId.get(edge.target.nodeId), `Missing target node: ${edge.id}`),
        edge.target.portId,
      ),
    })),
  }
  return {
    document,
    measured,
    nodes,
    edges,
    graph,
    layoutNodeIdByNodeId,
    layoutEdgeIdByEdgeId,
  }
}

/** Maps policy geometry back to exact domain IDs without changing semantic sockets. */
export function materializeMeasuredNodeSystemLayout<
  TNode extends NodeSystemNode,
  TEdge extends NodeSystemEdge,
>(
  prepared: PreparedMeasuredNodeSystemLayout<TNode, TEdge, LayoutPort>,
  result: LayoutResult,
): PositionedNodeSystem<TNode, NodeSystemPort, TEdge> {
  const rects = new Map(result.nodes.map((node) => [node.id, {
    x: node.x,
    y: node.y,
    w: node.width,
    h: node.height,
  }]))
  const resultPorts = new Map(result.ports.map((port) => [port.id, port]))
  const measuredNodes = new Map(prepared.measured.nodes.map((entry) => [entry.node.id, entry]))
  const positionedNodes = prepared.nodes.map((node): PositionedNodeSystemNode<TNode, NodeSystemPort> => {
    const layoutNodeId = required(
      prepared.layoutNodeIdByNodeId.get(node.id),
      `Missing positioned layout identity: ${node.id}`,
    )
    const rect = required(rects.get(layoutNodeId), `Layout omitted node: ${node.id}`)
    const measuredNode = required(measuredNodes.get(node.id), `Missing measured node: ${node.id}`)
    const measuredPorts = new Map(measuredNode.ports.map((entry) => [entry.port.id, entry]))
    const ports = (node.ports ?? []).map((port): PositionedNodeSystemPort => {
      const measuredPort = required(
        measuredPorts.get(port.id),
        `Measurement omitted positioned socket: ${node.id}/${port.id}`,
      )
      const geometry = resultPorts.get(enginePortId(layoutNodeId, port.id))
      const side = geometry === undefined
        ? disconnectedPortSide(measuredPort.port)
        : layoutSideToSemantic(geometry.side)
      return {
        port: measuredPort.port,
        side,
        center: geometry === undefined ? {
          x: side === "left" ? rect.x : rect.x + rect.w,
          y: rect.y + measuredPort.offsetY,
        } : {x: geometry.x, y: geometry.y},
      }
    })
    return {node, rect, ports}
  })
  const sections = new Map(result.edges.map((edge) => [edge.id, edge.sections[0]]))
  const positionedEdges = prepared.edges.map((edge): PositionedNodeSystemEdge<TEdge> => {
    const layoutEdgeId = required(
      prepared.layoutEdgeIdByEdgeId.get(edge.id),
      `Missing positioned edge identity: ${edge.id}`,
    )
    const section = required(sections.get(layoutEdgeId), `Layout omitted edge: ${edge.id}`)
    return {
      edge,
      points: [section.startPoint, ...section.bendPoints, section.endPoint],
    }
  })
  const positioned: PositionedNodeSystem<TNode, NodeSystemPort, TEdge> = {
    geometryKey: prepared.measured.geometryKey,
    bounds: {
      x: result.bounds.x,
      y: result.bounds.y,
      w: result.bounds.width,
      h: result.bounds.height,
    },
    nodes: positionedNodes,
    edges: positionedEdges,
    ...(prepared.document.revision === undefined ? {} : {revision: prepared.document.revision}),
  }
  validatePositionedNodeSystem(positioned)
  return positioned
}

function validateMeasuredTopology(
  document: NodeSystemDocument,
  measured: MeasuredNodeSystem,
): void {
  if (measured.revision !== document.revision) throw new Error("Measured topology revision differs from document")
  const measuredNodes = new Map(measured.nodes.map((entry) => [entry.node.id, entry]))
  if (measuredNodes.size !== document.nodes.length) throw new Error("Measured topology node set differs from document")
  for (const node of document.nodes) {
    const entry = measuredNodes.get(node.id)
    if (entry === undefined) throw new Error(`Measured topology omitted node: ${node.id}`)
    if ((entry.node.layoutId ?? entry.node.id) !== (node.layoutId ?? node.id) ||
        entry.node.parentId !== node.parentId ||
        entry.node.order !== node.order) {
      throw new Error(`Measured topology node identity differs from document: ${node.id}`)
    }
    const ports = new Map(entry.ports.map(({port}) => [port.id, port]))
    if (ports.size !== (node.ports ?? []).length) throw new Error(`Measured topology port set differs: ${node.id}`)
    for (const port of node.ports ?? []) {
      const measuredPort = ports.get(port.id)
      if (measuredPort === undefined ||
          measuredPort.direction !== port.direction ||
          measuredPort.connectionType !== port.connectionType ||
          measuredPort.side !== port.side) {
        throw new Error(`Measured topology port differs from document: ${node.id}/${port.id}`)
      }
    }
  }
  const measuredEdges = new Map(measured.edges.map((edge) => [edge.id, edge]))
  if (measuredEdges.size !== document.edges.length) throw new Error("Measured topology edge set differs from document")
  for (const edge of document.edges) {
    const measuredEdge = measuredEdges.get(edge.id)
    if (measuredEdge === undefined ||
        measuredEdge.source.nodeId !== edge.source.nodeId ||
        measuredEdge.source.portId !== edge.source.portId ||
        measuredEdge.target.nodeId !== edge.target.nodeId ||
        measuredEdge.target.portId !== edge.target.portId ||
        measuredEdge.connectionType !== edge.connectionType ||
        measuredEdge.order !== edge.order) {
      throw new Error(`Measured topology edge differs from document: ${edge.id}`)
    }
  }
}

function connectedPortRoles<TEdge extends NodeSystemEdge>(
  edges: readonly TEdge[],
): ReadonlyMap<string, readonly MeasuredLayoutPortRole[]> {
  const roles = new Map<string, MeasuredLayoutPortRole[]>()
  for (const edge of edges) {
    for (const role of ["source", "target"] as const) {
      const endpoint = edge[role]
      const id = endpointId(endpoint.nodeId, endpoint.portId)
      const values = roles.get(id) ?? []
      values.push({edgeId: edge.id, role})
      roles.set(id, values)
    }
  }
  return roles
}

function stableLayoutEdgeIds<TEdge extends NodeSystemEdge>(
  edges: readonly TEdge[],
  layoutNodeIdByNodeId: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const key = (edge: TEdge): string => JSON.stringify([
    required(layoutNodeIdByNodeId.get(edge.source.nodeId), `Missing source layout identity: ${edge.id}`),
    edge.source.portId,
    required(layoutNodeIdByNodeId.get(edge.target.nodeId), `Missing target layout identity: ${edge.id}`),
    edge.target.portId,
  ])
  const ordered = [...edges].sort((left, right) =>
    compareIds(key(left), key(right)) || compareOrdered(left, right))
  const width = Math.max(1, String(ordered.length).length)
  return new Map(ordered.map((edge, index) => [edge.id, `e${String(index).padStart(width, "0")}`]))
}

function disconnectedPortSide(port: NodeSystemPort): NodeSystemPortSide {
  return port.side ?? (port.direction === "in" ? "left" : "right")
}

function layoutSideToSemantic(side: "WEST" | "EAST"): NodeSystemPortSide {
  return side === "WEST" ? "left" : "right"
}

function endpointId(nodeId: string, portId: string): string {
  return `${nodeId}\u0000${portId}`
}

function splitEndpointId(value: string): readonly [string, string] {
  const separator = value.indexOf("\u0000")
  if (separator < 0) throw new Error(`Invalid measured endpoint identity: ${value}`)
  return [value.slice(0, separator), value.slice(separator + 1)]
}

export function enginePortId(nodeId: string, portId: string): string {
  return endpointId(nodeId, portId)
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
