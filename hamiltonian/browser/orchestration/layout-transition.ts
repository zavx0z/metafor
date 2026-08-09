import type {
  NodeSystemPoint,
  NodeSystemRect,
  PositionedNodeSystem,
  PositionedNodeSystemEdge,
  PositionedNodeSystemNode,
} from "@ui/node"

export const HAMILTONIAN_LAYOUT_TRANSITION_MS = 320

/**
 * Runtime identity may legitimately change while the visual slots stay put
 * (for example when Chrome wakes a new ServiceWorkerGlobalScope). Identity is
 * still replaced in the document, but it is not a reason to move the canvas.
 */
export function hamiltonianLayoutGeometryChanged(
  previous: PositionedNodeSystem,
  target: PositionedNodeSystem,
): boolean {
  if (!sameRect(previous.bounds, target.bounds) || previous.nodes.length !== target.nodes.length) return true
  return previous.nodes.some((entry, index) => !sameRect(entry.rect, target.nodes[index]!.rect))
}

/**
 * Reuses the newly calculated topology and routes while surviving nodes travel
 * from their preceding positions. New nodes are already present in the target
 * layout; removed nodes are absent because the owner event has ended them.
 */
export function interpolateHamiltonianNodePositions(
  previous: PositionedNodeSystem,
  target: PositionedNodeSystem,
  progress: number,
): PositionedNodeSystem {
  const t = Math.min(1, Math.max(0, progress))
  if (t >= 1) return target
  const previousById = new Map(previous.nodes.map((entry) => [entry.node.id, entry.rect]))
  const previousNodeById = new Map(previous.nodes.map((entry) => [entry.node.id, entry]))
  const targetNodeById = new Map(target.nodes.map((entry) => [entry.node.id, entry]))
  const startRects = new Map<string, NodeSystemRect>()
  const startRect = (entry: PositionedNodeSystemNode): NodeSystemRect => {
    const retained = startRects.get(entry.node.id)
    if (retained !== undefined) return retained
    const previousEntry = previousNodeById.get(entry.node.id)
    if (
      previousEntry !== undefined &&
      previousEntry.node.parentId === entry.node.parentId &&
      (entry.node.parentId === undefined || previousNodeById.has(entry.node.parentId))
    ) {
      startRects.set(entry.node.id, previousEntry.rect)
      return previousEntry.rect
    }
    if (entry.node.parentId === undefined) {
      startRects.set(entry.node.id, entry.rect)
      return entry.rect
    }
    const parent = required(targetNodeById.get(entry.node.parentId), `Missing target parent: ${entry.node.id}`)
    const parentStart = startRect(parent)
    const mapped = mapContainedRect(entry.rect, parent.rect, parentStart)
    startRects.set(entry.node.id, mapped)
    return mapped
  }

  const nodes = target.nodes.map((entry): PositionedNodeSystemNode => {
    const before = startRect(entry)
    const rect = interpolateRect(before, entry.rect, t)
    const previousEntry = previousNodeById.get(entry.node.id)
    return {
      node: entry.node,
      rect,
      ports: entry.ports.map(({port, center}) => {
        const previousCenter = previousEntry?.ports.find(({port: previousPort}) => previousPort.id === port.id)?.center
        const beforeCenter = previousCenter ?? mapPoint(center, entry.rect, before)
        return {port, center: interpolatePoint(beforeCenter, center, t)}
      }),
    }
  })
  const previousEdges = new Map(previous.edges.map((entry) => [entry.edge.id, entry]))
  const edges = target.edges.flatMap((entry): readonly PositionedNodeSystemEdge[] => {
    const before = previousEdges.get(entry.edge.id)
    // A newly observed transport is revealed with its complete ELK route at
    // the end. Drawing the target route while its endpoints still move would
    // fabricate a detached intermediate edge.
    if (before === undefined || !sameEdgeEndpoints(before, entry)) return []
    return [{...entry, points: interpolatePolyline(before.points, entry.points, t)}]
  })
  return {
    ...target,
    bounds: interpolateRect(previous.bounds, target.bounds, t),
    nodes,
    edges,
  }
}

export function easeHamiltonianLayoutTransition(progress: number): number {
  const t = Math.min(1, Math.max(0, progress))
  return 1 - (1 - t) ** 3
}

function sameRect(
  left: Readonly<{x: number; y: number; w: number; h: number}>,
  right: Readonly<{x: number; y: number; w: number; h: number}>,
): boolean {
  return close(left.x, right.x) && close(left.y, right.y) &&
    close(left.w, right.w) && close(left.h, right.h)
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-6
}

function interpolateRect(before: NodeSystemRect, target: NodeSystemRect, t: number): NodeSystemRect {
  return {
    x: before.x + (target.x - before.x) * t,
    y: before.y + (target.y - before.y) * t,
    w: before.w + (target.w - before.w) * t,
    h: before.h + (target.h - before.h) * t,
  }
}

function interpolatePoint(
  before: Readonly<{x: number; y: number}>,
  target: Readonly<{x: number; y: number}>,
  t: number,
): {x: number; y: number} {
  return {
    x: before.x + (target.x - before.x) * t,
    y: before.y + (target.y - before.y) * t,
  }
}

function mapContainedRect(rect: NodeSystemRect, from: NodeSystemRect, to: NodeSystemRect): NodeSystemRect {
  return {
    x: to.x + ((rect.x - from.x) / from.w) * to.w,
    y: to.y + ((rect.y - from.y) / from.h) * to.h,
    w: (rect.w / from.w) * to.w,
    h: (rect.h / from.h) * to.h,
  }
}

function mapPoint(
  point: Readonly<{x: number; y: number}>,
  from: NodeSystemRect,
  to: NodeSystemRect,
): {x: number; y: number} {
  return {
    x: to.x + ((point.x - from.x) / from.w) * to.w,
    y: to.y + ((point.y - from.y) / from.h) * to.h,
  }
}

function sameEdgeEndpoints(left: PositionedNodeSystemEdge, right: PositionedNodeSystemEdge): boolean {
  return left.edge.source.nodeId === right.edge.source.nodeId &&
    left.edge.source.portId === right.edge.source.portId &&
    left.edge.target.nodeId === right.edge.target.nodeId &&
    left.edge.target.portId === right.edge.target.portId
}

/** Morphs the complete previous ELK polyline into the complete target ELK polyline. */
function interpolatePolyline(
  before: readonly NodeSystemPoint[],
  target: readonly NodeSystemPoint[],
  t: number,
): readonly NodeSystemPoint[] {
  if (before.length < 2 || target.length < 2) return target
  const count = Math.max(before.length, target.length)
  const from = before.length === count ? before : samplePolyline(before, count)
  const to = target.length === count ? target : samplePolyline(target, count)
  return from.map((point, index) => interpolatePoint(point, to[index]!, t))
}

function samplePolyline(points: readonly NodeSystemPoint[], count: number): readonly NodeSystemPoint[] {
  const lengths: number[] = [0]
  for (let index = 1; index < points.length; index += 1) {
    lengths.push(lengths[index - 1]! + Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.y - points[index - 1]!.y,
    ))
  }
  const total = lengths.at(-1) ?? 0
  if (total <= Number.EPSILON) return Array.from({length: count}, () => points[0]!)
  return Array.from({length: count}, (_, sampleIndex) => {
    const distance = total * sampleIndex / Math.max(1, count - 1)
    let segment = 1
    while (segment < lengths.length - 1 && lengths[segment]! < distance) segment += 1
    const startDistance = lengths[segment - 1]!
    const endDistance = lengths[segment]!
    const ratio = (distance - startDistance) / Math.max(Number.EPSILON, endDistance - startDistance)
    return interpolatePoint(points[segment - 1]!, points[segment]!, ratio)
  })
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message)
  return value
}
