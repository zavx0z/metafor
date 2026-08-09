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
  const node = layout.nodes.find((entry) => entry.node.id === nodeId)?.node
  const byId = new Map(layout.nodes.map((entry) => [entry.node.id, entry.node]))
  return layout.nodes.every((entry) =>
    entry.node.id === nodeId ||
    isContainedBy(entry.node, nodeId, byId) ||
    (node !== undefined && isContainedBy(node, entry.node.id, byId)) ||
    !overlaps(rect, entry.rect, spacing))
}

/**
 * Keeps every surviving node anchored while accepting ELK geometry for new
 * nodes. The proposed layout is first aligned through an already positioned
 * neighbour, so an inserted node keeps its ELK relationship to the current
 * scene instead of appearing in the unrelated coordinate system of a fresh
 * full-graph layout. Only an inserted node may then be shifted to avoid an
 * existing obstacle.
 * Edge points are deliberately reduced to endpoints because this generic
 * helper describes an explicit manual edit. An application that delegates
 * geometry to ELK must run ELK again instead of using this helper.
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
  const expandedPositions = new Map(positions)
  const currentById = new Map(layout.nodes.map((entry) => [entry.node.id, entry]))
  let expanded = true
  while (expanded) {
    expanded = false
    for (const entry of layout.nodes) {
      if (entry.node.parentId === undefined || expandedPositions.has(entry.node.id)) continue
      const parentPosition = expandedPositions.get(entry.node.parentId)
      if (parentPosition === undefined) continue
      const parent = required(currentById.get(entry.node.parentId), `Missing contained parent: ${entry.node.parentId}`)
      expandedPositions.set(entry.node.id, {
        x: entry.rect.x + parentPosition.x - parent.rect.x,
        y: entry.rect.y + parentPosition.y - parent.rect.y,
      })
      expanded = true
    }
  }
  for (const [nodeId, position] of expandedPositions) {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error(`Invalid node position: ${nodeId}`)
    if (!layout.nodes.some(({node}) => node.id === nodeId)) throw new Error(`Missing positioned node: ${nodeId}`)
  }
  const nodes = layout.nodes.map((entry) => {
    const position = expandedPositions.get(entry.node.id)
    return position === undefined ? entry : translateNode(entry, position.x, position.y)
  })
  const nodeIndex = new Map(nodes.map((entry) => [entry.node.id, entry]))
  const edges = layout.edges.map((entry): PositionedNodeSystemEdge => {
    if (!expandedPositions.has(entry.edge.source.nodeId) && !expandedPositions.has(entry.edge.target.nodeId)) return entry
    const points = [...entry.points]
    if (expandedPositions.has(entry.edge.source.nodeId)) points[0] = endpointCenter(entry.edge.source, nodeIndex)
    if (expandedPositions.has(entry.edge.target.nodeId)) points[points.length - 1] = endpointCenter(entry.edge.target, nodeIndex)
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
  if (current.node.parentId !== undefined) throw new Error(`Contained node width is controlled by its parent: ${nodeId}`)
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
  const translatedChildren = new Map<string, PositionedNodeSystemNode>()
  const directDeltas = new Map<string, NodeSystemPoint>()
  for (const child of layout.nodes) {
    if (child.node.parentId !== nodeId) continue
    const nextX = rect.x + (rect.w - child.rect.w) / 2
    directDeltas.set(child.node.id, {x: nextX - child.rect.x, y: 0})
  }
  const nodeById = new Map(layout.nodes.map((entry) => [entry.node.id, entry.node]))
  for (const child of layout.nodes) {
    if (!isContainedBy(child.node, nodeId, nodeById)) continue
    const directChildId = directChildBelow(child.node, nodeId, nodeById)
    const delta = directDeltas.get(directChildId)
    if (delta === undefined) continue
    translatedChildren.set(child.node.id, translateNode(
      child,
      child.rect.x + delta.x,
      child.rect.y + delta.y,
    ))
  }
  const nodes = layout.nodes.map((entry) =>
    entry.node.id === nodeId ? resized : translatedChildren.get(entry.node.id) ?? entry)
  const nodeIndex = new Map(nodes.map((entry) => [entry.node.id, entry]))
  const changedNodeIds = new Set([nodeId, ...translatedChildren.keys()])
  const edges = layout.edges.map((entry): PositionedNodeSystemEdge => {
    if (!changedNodeIds.has(entry.edge.source.nodeId) && !changedNodeIds.has(entry.edge.target.nodeId)) return entry
    const points = [...entry.points]
    if (changedNodeIds.has(entry.edge.source.nodeId)) points[0] = endpointCenter(entry.edge.source, nodeIndex)
    if (changedNodeIds.has(entry.edge.target.nodeId)) points[points.length - 1] = endpointCenter(entry.edge.target, nodeIndex)
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

function isContainedBy(
  node: Readonly<{id: string; parentId?: string}>,
  ancestorId: string,
  nodes: ReadonlyMap<string, Readonly<{id: string; parentId?: string}>>,
): boolean {
  let parentId = node.parentId
  const seen = new Set<string>()
  while (parentId !== undefined && !seen.has(parentId)) {
    if (parentId === ancestorId) return true
    seen.add(parentId)
    parentId = nodes.get(parentId)?.parentId
  }
  return false
}

function directChildBelow(
  node: Readonly<{id: string; parentId?: string}>,
  ancestorId: string,
  nodes: ReadonlyMap<string, Readonly<{id: string; parentId?: string}>>,
): string {
  let current = node
  while (current.parentId !== ancestorId) {
    current = required(nodes.get(current.parentId!), `Missing containment ancestor: ${current.id}`)
  }
  return current.id
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
