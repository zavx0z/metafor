import type {
  NodeSystemDocument,
  NodeSystemEndpoint,
  NodeSystemNode,
  NodeSystemPort,
  NodeSystemRect,
  PositionedNodeSystem,
} from "./types/model.ts"
import type {MeasuredNodeSystem} from "./types/measured.ts"
import type {NodeSystemIndex} from "./types/validation.ts"

/** Rejects ambiguity instead of silently dropping nodes, ports or edges. */
export function validateNodeSystemDocument(document: NodeSystemDocument): NodeSystemIndex {
  const nodes = new Map<string, NodeSystemNode>()
  const ports = new Map<string, ReadonlyMap<string, NodeSystemPort>>()
  const layoutIds = new Set<string>()

  for (const node of document.nodes) {
    requireIdentifier(node.id, "node")
    if (nodes.has(node.id)) throw new Error(`Duplicate node id: ${node.id}`)
    const layoutId = node.layoutId ?? node.id
    requireIdentifier(layoutId, `layout node on ${node.id}`)
    if (layoutIds.has(layoutId)) throw new Error(`Duplicate node layoutId: ${layoutId}`)
    layoutIds.add(layoutId)
    requireFiniteOrder(node.order, `Node order must be finite: ${node.id}`)

    const nodePorts = new Map<string, NodeSystemPort>()
    for (const port of node.ports ?? []) {
      requireIdentifier(port.id, `port on ${node.id}`)
      if (nodePorts.has(port.id)) throw new Error(`Duplicate port id: ${node.id}/${port.id}`)
      if (port.direction !== "in" && port.direction !== "out" && port.direction !== "inout") {
        throw new Error(`Invalid port direction: ${node.id}/${port.id}`)
      }
      if (port.side !== undefined && port.side !== "left" && port.side !== "right") {
        throw new Error(`Invalid port side: ${node.id}/${port.id}`)
      }
      if (port.connectionType !== undefined) {
        requireIdentifier(port.connectionType, `connection type on port ${node.id}/${port.id}`)
      }
      nodePorts.set(port.id, port)
    }
    nodes.set(node.id, node)
    ports.set(node.id, nodePorts)
  }

  for (const node of document.nodes) {
    if (node.parentId === undefined) continue
    requireIdentifier(node.parentId, `parent on ${node.id}`)
    if (node.parentId === node.id) throw new Error(`Node cannot contain itself: ${node.id}`)
    const parent = nodes.get(node.parentId)
    if (parent === undefined) throw new Error(`Unknown parent node: ${node.id}/${node.parentId}`)
  }
  for (const node of document.nodes) {
    const path = new Set<string>()
    let current: NodeSystemNode | undefined = node
    while (current?.parentId !== undefined) {
      if (path.has(current.id)) throw new Error(`Containment cycle: ${node.id}`)
      path.add(current.id)
      current = nodes.get(current.parentId)
    }
  }

  const edgeIds = new Set<string>()
  for (const edge of document.edges) {
    requireIdentifier(edge.id, "edge")
    if (edgeIds.has(edge.id)) throw new Error(`Duplicate edge id: ${edge.id}`)
    edgeIds.add(edge.id)
    requireFiniteOrder(edge.order, `Edge order must be finite: ${edge.id}`)
    validateEndpoint(edge.source, "source", edge.id, nodes, ports)
    validateEndpoint(edge.target, "target", edge.id, nodes, ports)
    validateConnectionType(edge, ports)
  }

  return {nodes, ports}
}

function validateConnectionType(
  edge: NodeSystemDocument["edges"][number],
  ports: ReadonlyMap<string, ReadonlyMap<string, NodeSystemPort>>,
): void {
  const sourceType = ports.get(edge.source.nodeId)?.get(edge.source.portId)?.connectionType
  const targetType = ports.get(edge.target.nodeId)?.get(edge.target.portId)?.connectionType
  const provided = [edge.connectionType, sourceType, targetType].filter((value) => value !== undefined)
  if (provided.length === 0) return
  if (edge.connectionType === undefined || sourceType === undefined || targetType === undefined) {
    throw new Error(`Incomplete edge connection type: ${edge.id}`)
  }
  requireIdentifier(edge.connectionType, `connection type on edge ${edge.id}`)
  if (sourceType !== edge.connectionType || targetType !== edge.connectionType) {
    throw new Error(`Mismatched edge connection type: ${edge.id}`)
  }
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
      if (entryPort.side !== "left" && entryPort.side !== "right") {
        throw new Error(`Invalid positioned port side: ${entry.node.id}/${id}`)
      }
      const expectedX = entryPort.side === "left" ? entry.rect.x : entry.rect.x + entry.rect.w
      if (Math.abs(entryPort.center.x - expectedX) > 1e-6) {
        throw new Error(`Positioned port is detached from resolved side: ${entry.node.id}/${id}`)
      }
    }
    if (positionedPortIds.size !== expectedPorts.size) throw new Error(`Positioned ports are incomplete: ${entry.node.id}`)
  }
  if (positionedNodeIds.size !== index.nodes.size) throw new Error("Positioned nodes are incomplete")

  const positionedById = new Map(layout.nodes.map((entry) => [entry.node.id, entry]))
  for (const entry of layout.nodes) {
    if (entry.node.parentId === undefined) continue
    const parent = positionedById.get(entry.node.parentId)!
    if (!contains(parent.rect, entry.rect)) {
      throw new Error(`Contained node escapes parent: ${entry.node.id}/${entry.node.parentId}`)
    }
  }

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

/** Validates the UI-independent numeric boundary consumed by layout policies. */
export function validateMeasuredNodeSystem(measured: MeasuredNodeSystem): NodeSystemIndex {
  if (measured.geometryKey.length === 0) throw new Error("Measured geometry key must be non-empty")
  const document: NodeSystemDocument = {
    ...(measured.revision === undefined ? {} : {revision: measured.revision}),
    nodes: measured.nodes.map(({node}) => node),
    edges: measured.edges,
  }
  const index = validateNodeSystemDocument(document)
  const measuredNodeIds = new Set<string>()
  for (const entry of measured.nodes) {
    if (measuredNodeIds.has(entry.node.id)) throw new Error(`Duplicate measured node id: ${entry.node.id}`)
    measuredNodeIds.add(entry.node.id)
    requirePositiveSize(entry.width, `Measured node width must be positive: ${entry.node.id}`)
    requirePositiveSize(entry.height, `Measured node height must be positive: ${entry.node.id}`)
    if (!Number.isFinite(entry.contentHeight) || entry.contentHeight < 0 || entry.contentHeight > entry.height) {
      throw new Error(`Measured node content height is invalid: ${entry.node.id}`)
    }
    const expectedPorts = index.ports.get(entry.node.id) ?? new Map()
    const measuredPortIds = new Set<string>()
    for (const entryPort of entry.ports) {
      const id = entryPort.port.id
      if (measuredPortIds.has(id)) throw new Error(`Duplicate measured port id: ${entry.node.id}/${id}`)
      measuredPortIds.add(id)
      if (!expectedPorts.has(id)) throw new Error(`Unknown measured port: ${entry.node.id}/${id}`)
      if (!Number.isFinite(entryPort.offsetY) || entryPort.offsetY < 0 || entryPort.offsetY > entry.height) {
        throw new Error(`Measured port offset is invalid: ${entry.node.id}/${id}`)
      }
    }
    if (measuredPortIds.size !== expectedPorts.size) throw new Error(`Measured ports are incomplete: ${entry.node.id}`)
  }
  if (measuredNodeIds.size !== index.nodes.size) throw new Error("Measured nodes are incomplete")
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
  if (!ports.get(endpoint.nodeId)?.has(endpoint.portId)) {
    throw new Error(`Unknown ${role} port for edge ${edgeId}: ${endpoint.nodeId}/${endpoint.portId}`)
  }
}

function requireIdentifier(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} id must be non-empty`)
}

function requirePositiveSize(value: number, message: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(message)
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

function contains(outer: NodeSystemRect, inner: NodeSystemRect): boolean {
  const epsilon = 1e-6
  return inner.x + epsilon >= outer.x && inner.y + epsilon >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w + epsilon &&
    inner.y + inner.h <= outer.y + outer.h + epsilon
}
