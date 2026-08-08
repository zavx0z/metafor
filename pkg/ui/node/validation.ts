import type {
  NodeSystemDocument,
  NodeSystemEndpoint,
  NodeSystemNode,
  NodeSystemPort,
  NodeSystemRect,
  PositionedNodeSystem,
} from "./model.ts"

export type NodeSystemIndex = Readonly<{
  nodes: ReadonlyMap<string, NodeSystemNode>
  ports: ReadonlyMap<string, ReadonlyMap<string, NodeSystemPort>>
}>

/** Rejects ambiguity instead of silently dropping nodes, ports or edges. */
export function validateNodeSystemDocument(document: NodeSystemDocument): NodeSystemIndex {
  const nodes = new Map<string, NodeSystemNode>()
  const ports = new Map<string, ReadonlyMap<string, NodeSystemPort>>()

  for (const node of document.nodes) {
    requireIdentifier(node.id, "node")
    if (nodes.has(node.id)) throw new Error(`Duplicate node id: ${node.id}`)
    if (node.title.trim().length === 0) throw new Error(`Node title must be non-empty: ${node.id}`)
    requirePositiveSize(node.width, `Node width must be positive: ${node.id}`)
    requirePositiveSize(node.height, `Node height must be positive: ${node.id}`)
    requireFiniteOrder(node.order, `Node order must be finite: ${node.id}`)

    const nodePorts = new Map<string, NodeSystemPort>()
    for (const port of node.ports ?? []) {
      requireIdentifier(port.id, `port on ${node.id}`)
      if (nodePorts.has(port.id)) throw new Error(`Duplicate port id: ${node.id}/${port.id}`)
      nodePorts.set(port.id, port)
    }
    const factIds = new Set<string>()
    for (const fact of node.facts ?? []) {
      requireIdentifier(fact.id, `fact on ${node.id}`)
      if (factIds.has(fact.id)) throw new Error(`Duplicate fact id: ${node.id}/${fact.id}`)
      factIds.add(fact.id)
    }
    const actionIds = new Set<string>()
    for (const action of node.actions ?? []) {
      requireIdentifier(action.id, `action on ${node.id}`)
      if (actionIds.has(action.id)) throw new Error(`Duplicate action id: ${node.id}/${action.id}`)
      actionIds.add(action.id)
    }
    nodes.set(node.id, node)
    ports.set(node.id, nodePorts)
  }

  const edgeIds = new Set<string>()
  for (const edge of document.edges) {
    requireIdentifier(edge.id, "edge")
    if (edgeIds.has(edge.id)) throw new Error(`Duplicate edge id: ${edge.id}`)
    edgeIds.add(edge.id)
    requireFiniteOrder(edge.order, `Edge order must be finite: ${edge.id}`)
    validateEndpoint(edge.source, "source", edge.id, nodes, ports)
    validateEndpoint(edge.target, "target", edge.id, nodes, ports)
  }

  return {nodes, ports}
}

/** Validates fixed geometry before it crosses a routing-process boundary. */
export function validatePositionedNodeSystem(layout: PositionedNodeSystem): NodeSystemIndex {
  requireRect(layout.bounds, "Layout bounds")
  const document: NodeSystemDocument = {
    ...(layout.revision === undefined ? {} : {revision: layout.revision}),
    nodes: layout.nodes.map(({node}) => node),
    edges: layout.edges.map(({edge}) => edge),
  }
  const index = validateNodeSystemDocument(document)
  const positionedNodeIds = new Set<string>()
  for (const entry of layout.nodes) {
    if (positionedNodeIds.has(entry.node.id)) throw new Error(`Duplicate positioned node id: ${entry.node.id}`)
    positionedNodeIds.add(entry.node.id)
    requireRect(entry.rect, `Positioned node rect: ${entry.node.id}`)
    const expectedPorts = index.ports.get(entry.node.id) ?? new Map()
    const positionedPortIds = new Set<string>()
    for (const entryPort of entry.ports) {
      const id = entryPort.port.id
      if (positionedPortIds.has(id)) throw new Error(`Duplicate positioned port id: ${entry.node.id}/${id}`)
      positionedPortIds.add(id)
      if (!expectedPorts.has(id)) throw new Error(`Unknown positioned port: ${entry.node.id}/${id}`)
      requirePoint(entryPort.center.x, entryPort.center.y, `Positioned port center: ${entry.node.id}/${id}`)
    }
    if (positionedPortIds.size !== expectedPorts.size) throw new Error(`Positioned ports are incomplete: ${entry.node.id}`)
  }
  if (positionedNodeIds.size !== index.nodes.size) throw new Error("Positioned nodes are incomplete")

  const positionedEdgeIds = new Set<string>()
  for (const entry of layout.edges) {
    if (positionedEdgeIds.has(entry.edge.id)) throw new Error(`Duplicate positioned edge id: ${entry.edge.id}`)
    positionedEdgeIds.add(entry.edge.id)
    if (entry.points.length < 2) throw new Error(`Positioned edge requires at least two points: ${entry.edge.id}`)
    for (const point of entry.points) requirePoint(point.x, point.y, `Positioned edge point: ${entry.edge.id}`)
  }
  if (positionedEdgeIds.size !== document.edges.length) throw new Error("Positioned edges are incomplete")
  return index
}

function validateEndpoint(
  endpoint: NodeSystemEndpoint,
  role: "source" | "target",
  edgeId: string,
  nodes: ReadonlyMap<string, NodeSystemNode>,
  ports: ReadonlyMap<string, ReadonlyMap<string, NodeSystemPort>>,
): void {
  const node = nodes.get(endpoint.nodeId)
  if (node === undefined) throw new Error(`Unknown ${role} node for edge ${edgeId}: ${endpoint.nodeId}`)
  if (endpoint.portId === undefined) return
  if (!ports.get(endpoint.nodeId)?.has(endpoint.portId)) {
    throw new Error(`Unknown ${role} port for edge ${edgeId}: ${endpoint.nodeId}/${endpoint.portId}`)
  }
}

function requireIdentifier(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} id must be non-empty`)
}

function requirePositiveSize(value: number | undefined, message: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error(message)
}

function requireFiniteOrder(value: number | undefined, message: string): void {
  if (value !== undefined && !Number.isFinite(value)) throw new Error(message)
}

function requireRect(rect: NodeSystemRect, label: string): void {
  requirePoint(rect.x, rect.y, label)
  if (!Number.isFinite(rect.w) || rect.w <= 0 || !Number.isFinite(rect.h) || rect.h <= 0) {
    throw new Error(`${label} must have a finite positive size`)
  }
}

function requirePoint(x: number, y: number, label: string): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`${label} must be finite`)
}
