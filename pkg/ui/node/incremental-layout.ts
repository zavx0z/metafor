import type {
  NodeSystemEndpoint,
  NodeSystemPoint,
  NodeSystemRect,
  PositionedNodeSystem,
  PositionedNodeSystemEdge,
  PositionedNodeSystemNode,
} from "./model.ts"
import {validatePositionedNodeSystem} from "./validation.ts"

export type StableNodeSystemLayoutOptions = Readonly<{
  /** Empty space kept between a newly inserted card and every anchored card. */
  spacing?: number
  /** Outer space included in the returned fit bounds. */
  padding?: number
}>

export type NodeSystemAnchors = ReadonlyMap<string, NodeSystemPoint>

/** Checks one proposed card frame against every other positioned card. */
export function isNodeSystemRectVacant(
  layout: PositionedNodeSystem,
  nodeId: string,
  rect: NodeSystemRect,
  options: Pick<StableNodeSystemLayoutOptions, "spacing"> = {},
): boolean {
  validatePositionedNodeSystem(layout)
  if (
    !Number.isFinite(rect.x) || !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.w) || !Number.isFinite(rect.h) ||
    rect.w <= 0 || rect.h <= 0
  ) {
    throw new Error(`Invalid node frame: ${nodeId}`)
  }
  const spacing = finiteNonNegative(options.spacing, 0)
  return layout.nodes.every((entry) => entry.node.id === nodeId || !overlaps(rect, entry.rect, spacing))
}

/**
 * Keeps every surviving node anchored while accepting ELK geometry for new
 * nodes. The proposed layout is first aligned through an already positioned
 * neighbour, so an inserted node keeps its ELK relationship to the current
 * scene instead of appearing in the unrelated coordinate system of a fresh
 * full-graph layout. Only an inserted node may then be shifted to avoid an
 * existing obstacle.
 * Edge points are deliberately reduced to endpoints: the fixed geometry is
 * expected to be routed by Libavoid afterwards.
 */
export function stabilizeNodeSystemLayout(
  previous: PositionedNodeSystem,
  proposed: PositionedNodeSystem,
  options: StableNodeSystemLayoutOptions = {},
): PositionedNodeSystem {
  validatePositionedNodeSystem(previous)
  validatePositionedNodeSystem(proposed)
  const spacing = finiteNonNegative(options.spacing, 28)
  const padding = finiteNonNegative(options.padding, 40)
  const previousById = new Map(previous.nodes.map((entry) => [entry.node.id, entry]))
  const proposedById = new Map(proposed.nodes.map((entry) => [entry.node.id, entry]))
  const anchored = new Map<string, PositionedNodeSystemNode>()
  const inserted: PositionedNodeSystemNode[] = []

  for (const candidate of proposed.nodes) {
    const old = previousById.get(candidate.node.id)
    if (old === undefined) {
      inserted.push(candidate)
      continue
    }
    anchored.set(candidate.node.id, translateNode(candidate, old.rect.x, old.rect.y))
  }

  const occupied = [...anchored.values()].map(({rect}) => rect)
  for (const candidate of inserted) {
    const preferred = alignInsertedRect(candidate, proposedById, anchored, proposed.edges)
    const rect = firstVacantRect(preferred, occupied, spacing)
    const positioned = translateNode(candidate, rect.x, rect.y)
    anchored.set(candidate.node.id, positioned)
    occupied.push(positioned.rect)
  }

  const nodes = proposed.nodes.map(({node}) => required(anchored.get(node.id), `Missing stable node: ${node.id}`))
  const nodeIndex = new Map(nodes.map((entry) => [entry.node.id, entry]))
  const edges = proposed.edges.map(({edge}): PositionedNodeSystemEdge => ({
    edge,
    points: [endpointCenter(edge.source, nodeIndex), endpointCenter(edge.target, nodeIndex)],
  }))
  const result: PositionedNodeSystem = {
    ...(proposed.revision === undefined ? {} : {revision: proposed.revision}),
    ...(proposed.geometryKey === undefined ? {} : {geometryKey: proposed.geometryKey}),
    bounds: contentBounds(nodes, padding),
    nodes,
    edges,
  }
  validatePositionedNodeSystem(result)
  return result
}

function alignInsertedRect(
  candidate: PositionedNodeSystemNode,
  proposedById: ReadonlyMap<string, PositionedNodeSystemNode>,
  positioned: ReadonlyMap<string, PositionedNodeSystemNode>,
  edges: readonly PositionedNodeSystemEdge[],
): NodeSystemRect {
  const connected = new Set<string>()
  for (const {edge} of edges) {
    if (edge.source.nodeId === candidate.node.id) connected.add(edge.target.nodeId)
    if (edge.target.nodeId === candidate.node.id) connected.add(edge.source.nodeId)
  }
  const neighbourOffsets = alignmentOffsets(connected, proposedById, positioned)
  const offsets = neighbourOffsets.length > 0
    ? neighbourOffsets
    : alignmentOffsets(positioned.keys(), proposedById, positioned)
  if (offsets.length === 0) return candidate.rect
  return {
    ...candidate.rect,
    x: candidate.rect.x + median(offsets.map(({x}) => x)),
    y: candidate.rect.y + median(offsets.map(({y}) => y)),
  }
}

function alignmentOffsets(
  nodeIds: Iterable<string>,
  proposedById: ReadonlyMap<string, PositionedNodeSystemNode>,
  positioned: ReadonlyMap<string, PositionedNodeSystemNode>,
): NodeSystemPoint[] {
  const offsets: NodeSystemPoint[] = []
  for (const nodeId of nodeIds) {
    const proposed = proposedById.get(nodeId)
    const actual = positioned.get(nodeId)
    if (proposed === undefined || actual === undefined) continue
    offsets.push({x: actual.rect.x - proposed.rect.x, y: actual.rect.y - proposed.rect.y})
  }
  return offsets
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]!
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}

/** Moves one fixed node and its ports without changing any other node. */
export function moveNodeSystemNode(
  layout: PositionedNodeSystem,
  nodeId: string,
  position: NodeSystemPoint,
  options: Pick<StableNodeSystemLayoutOptions, "padding"> = {},
): PositionedNodeSystem {
  return moveNodeSystemNodes(layout, new Map([[nodeId, position]]), options)
}

/** Moves a fixed group atomically and updates every connected endpoint once. */
export function moveNodeSystemNodes(
  layout: PositionedNodeSystem,
  positions: ReadonlyMap<string, NodeSystemPoint>,
  options: Pick<StableNodeSystemLayoutOptions, "padding"> = {},
): PositionedNodeSystem {
  validatePositionedNodeSystem(layout)
  for (const [nodeId, position] of positions) {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error(`Invalid node position: ${nodeId}`)
    if (!layout.nodes.some(({node}) => node.id === nodeId)) throw new Error(`Missing positioned node: ${nodeId}`)
  }
  const nodes = layout.nodes.map((entry) => {
    const position = positions.get(entry.node.id)
    return position === undefined ? entry : translateNode(entry, position.x, position.y)
  })
  const nodeIndex = new Map(nodes.map((entry) => [entry.node.id, entry]))
  const edges = layout.edges.map((entry): PositionedNodeSystemEdge => {
    if (!positions.has(entry.edge.source.nodeId) && !positions.has(entry.edge.target.nodeId)) return entry
    const points = [...entry.points]
    if (positions.has(entry.edge.source.nodeId)) points[0] = endpointCenter(entry.edge.source, nodeIndex)
    if (positions.has(entry.edge.target.nodeId)) points[points.length - 1] = endpointCenter(entry.edge.target, nodeIndex)
    return {...entry, points}
  })
  const result: PositionedNodeSystem = {
    ...layout,
    bounds: contentBounds(nodes, finiteNonNegative(options.padding, 40)),
    nodes,
    edges,
  }
  validatePositionedNodeSystem(result)
  return result
}

/**
 * Resizes one fixed card while preserving every other card. Port centers keep
 * their normalized horizontal position, so left/right sockets stay attached
 * to the resized border and connected edge endpoints follow immediately.
 */
export function resizeNodeSystemNode(
  layout: PositionedNodeSystem,
  nodeId: string,
  rect: Readonly<{x: number; w: number}>,
  options: Pick<StableNodeSystemLayoutOptions, "padding"> = {},
): PositionedNodeSystem {
  validatePositionedNodeSystem(layout)
  if (!Number.isFinite(rect.x) || !Number.isFinite(rect.w) || rect.w <= 0) {
    throw new Error(`Invalid node width: ${nodeId}`)
  }
  const current = required(layout.nodes.find(({node}) => node.id === nodeId), `Missing positioned node: ${nodeId}`)
  const resized: PositionedNodeSystemNode = {
    node: current.node,
    rect: {...current.rect, x: rect.x, w: rect.w},
    ports: current.ports.map(({port, center}) => {
      const horizontalRatio = (center.x - current.rect.x) / current.rect.w
      return {
        port,
        center: {
          x: rect.x + horizontalRatio * rect.w,
          y: center.y,
        },
      }
    }),
  }
  const nodes = layout.nodes.map((entry) => entry.node.id === nodeId ? resized : entry)
  const nodeIndex = new Map(nodes.map((entry) => [entry.node.id, entry]))
  const edges = layout.edges.map((entry): PositionedNodeSystemEdge => {
    if (entry.edge.source.nodeId !== nodeId && entry.edge.target.nodeId !== nodeId) return entry
    const points = [...entry.points]
    if (entry.edge.source.nodeId === nodeId) points[0] = endpointCenter(entry.edge.source, nodeIndex)
    if (entry.edge.target.nodeId === nodeId) points[points.length - 1] = endpointCenter(entry.edge.target, nodeIndex)
    return {...entry, points}
  })
  const result: PositionedNodeSystem = {
    ...layout,
    bounds: contentBounds(nodes, finiteNonNegative(options.padding, 40)),
    nodes,
    edges,
  }
  validatePositionedNodeSystem(result)
  return result
}

/** Applies persisted manual anchors; unknown/removed node IDs are ignored. */
export function applyNodeSystemAnchors(
  layout: PositionedNodeSystem,
  anchors: NodeSystemAnchors,
  options: Pick<StableNodeSystemLayoutOptions, "padding"> = {},
): PositionedNodeSystem {
  let result = layout
  for (const nodeId of [...anchors.keys()].sort(compareIds)) {
    if (!result.nodes.some(({node}) => node.id === nodeId)) continue
    result = moveNodeSystemNode(result, nodeId, anchors.get(nodeId)!, options)
  }
  return result
}

function translateNode(entry: PositionedNodeSystemNode, x: number, y: number): PositionedNodeSystemNode {
  const dx = x - entry.rect.x
  const dy = y - entry.rect.y
  return {
    node: entry.node,
    rect: {...entry.rect, x, y},
    ports: entry.ports.map(({port, center}) => ({
      port,
      center: {x: center.x + dx, y: center.y + dy},
    })),
  }
}

function firstVacantRect(preferred: NodeSystemRect, occupied: readonly NodeSystemRect[], spacing: number): NodeSystemRect {
  let candidate = preferred
  for (let attempt = 0; attempt <= occupied.length; attempt += 1) {
    const collisions = occupied.filter((rect) => overlaps(candidate, rect, spacing))
    if (collisions.length === 0) return candidate
    candidate = {
      ...candidate,
      y: Math.max(...collisions.map((rect) => rect.y + rect.h + spacing)),
    }
  }
  throw new Error("Unable to place an inserted node without overlap")
}

function overlaps(left: NodeSystemRect, right: NodeSystemRect, spacing: number): boolean {
  return left.x < right.x + right.w + spacing &&
    left.x + left.w + spacing > right.x &&
    left.y < right.y + right.h + spacing &&
    left.y + left.h + spacing > right.y
}

function endpointCenter(
  endpoint: NodeSystemEndpoint,
  nodes: ReadonlyMap<string, PositionedNodeSystemNode>,
): NodeSystemPoint {
  const node = required(nodes.get(endpoint.nodeId), `Missing positioned node: ${endpoint.nodeId}`)
  if (endpoint.portId === undefined) return {x: node.rect.x + node.rect.w / 2, y: node.rect.y + node.rect.h / 2}
  return required(
    node.ports.find(({port}) => port.id === endpoint.portId),
    `Missing positioned port: ${endpoint.nodeId}/${endpoint.portId}`,
  ).center
}

function contentBounds(nodes: readonly PositionedNodeSystemNode[], padding: number): NodeSystemRect {
  if (nodes.length === 0) return {x: 0, y: 0, w: 1, h: 1}
  const minX = Math.min(...nodes.map(({rect}) => rect.x))
  const minY = Math.min(...nodes.map(({rect}) => rect.y))
  const maxX = Math.max(...nodes.map(({rect}) => rect.x + rect.w))
  const maxY = Math.max(...nodes.map(({rect}) => rect.y + rect.h))
  const x = Math.min(0, minX - padding)
  const y = Math.min(0, minY - padding)
  return {x, y, w: Math.max(1, maxX + padding - x), h: Math.max(1, maxY + padding - y)}
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message)
  return value
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
