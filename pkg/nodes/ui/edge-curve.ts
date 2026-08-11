import type {
  NodeSystemPoint,
  NodeSystemRect,
} from "../types/model.ts"

export type NodeSystemCubicBezier = Readonly<{
  from: NodeSystemPoint
  control1: NodeSystemPoint
  control2: NodeSystemPoint
  to: NodeSystemPoint
}>

export type NodeSystemEdgeHitTarget = Readonly<{
  edgeId: string
  rects: readonly NodeSystemRect[]
}>

/**
 * Converts an engine-routed polyline into cubics that round each routed corner.
 * Curves remain inside a bounded radius around the original route instead of
 * replacing it with one unconstrained source-to-target spline.
 */
export function planNodeSystemBezierPath(
  points: readonly NodeSystemPoint[],
  cornerRadius = 10,
): readonly NodeSystemCubicBezier[] {
  if (points.length < 2) return []
  const radius = Number.isFinite(cornerRadius) ? Math.max(0, cornerRadius) : 10
  const segments: NodeSystemCubicBezier[] = []
  let cursor = points[0]!
  for (let index = 1; index < points.length; index += 1) {
    const corner = points[index]!
    const next = points[index + 1]
    if (next === undefined || radius === 0 || collinear(points[index - 1]!, corner, next)) {
      appendSegment(segments, lineBezier(cursor, corner))
      cursor = corner
      continue
    }
    const previous = points[index - 1]!
    const entry = toward(corner, previous, Math.min(radius, distance(previous, corner) / 2))
    const exit = toward(corner, next, Math.min(radius, distance(corner, next) / 2))
    appendSegment(segments, lineBezier(cursor, entry))
    appendSegment(segments, {
      from: entry,
      control1: lerp(entry, corner, 2 / 3),
      control2: lerp(exit, corner, 2 / 3),
      to: exit,
    })
    cursor = exit
  }
  return segments
}

export function sampleNodeSystemCubicBezier(
  segment: NodeSystemCubicBezier,
  steps = 6,
): readonly NodeSystemPoint[] {
  const count = Number.isFinite(steps) ? Math.max(1, Math.floor(steps)) : 6
  const points: NodeSystemPoint[] = [segment.from]
  for (let index = 1; index <= count; index += 1) points.push(cubicPoint(segment, index / count))
  return points
}

/** Produces one connected stroke: straight runs stay single segments. */
export function sampleNodeSystemBezierPath(
  points: readonly NodeSystemPoint[],
  cornerRadius = 10,
  curveSteps = 6,
): readonly NodeSystemPoint[] {
  const sampled: NodeSystemPoint[] = []
  for (const segment of planNodeSystemBezierPath(points, cornerRadius)) {
    const next = sampleNodeSystemCubicBezier(segment, isStraight(segment) ? 1 : curveSteps)
    for (const point of next) {
      const previous = sampled.at(-1)
      if (previous === undefined || distance(previous, point) > Number.EPSILON) sampled.push(point)
    }
  }
  return sampled
}

/** Narrow axis-aligned hover corridors over the sampled connected stroke. */
export function planNodeSystemEdgeHitRects(
  stroke: readonly NodeSystemPoint[],
  radius = 6,
): readonly NodeSystemRect[] {
  const padding = Number.isFinite(radius) ? Math.max(1, radius) : 6
  const rects: NodeSystemRect[] = []
  for (let index = 1; index < stroke.length; index += 1) {
    const from = stroke[index - 1]!
    const to = stroke[index]!
    if (distance(from, to) <= Number.EPSILON) continue
    rects.push({
      x: Math.min(from.x, to.x) - padding,
      y: Math.min(from.y, to.y) - padding,
      w: Math.abs(to.x - from.x) + padding * 2,
      h: Math.abs(to.y - from.y) + padding * 2,
    })
  }
  return rects
}

/** All semantic edges whose visible hover corridors contain the pointer. */
export function hitTestNodeSystemEdges(
  targets: readonly NodeSystemEdgeHitTarget[],
  point: NodeSystemPoint,
  blockingRects: readonly NodeSystemRect[] = [],
): readonly string[] {
  if (blockingRects.some((rect) => pointInsideRect(point, rect))) return []
  const edgeIds = new Set<string>()
  for (const target of targets) {
    if (target.rects.some((rect) => pointInsideRect(point, rect))) edgeIds.add(target.edgeId)
  }
  return [...edgeIds].sort(stableIdCompare)
}

function cubicPoint(segment: NodeSystemCubicBezier, t: number): NodeSystemPoint {
  const u = 1 - t
  return {
    x: u ** 3 * segment.from.x + 3 * u ** 2 * t * segment.control1.x + 3 * u * t ** 2 * segment.control2.x + t ** 3 * segment.to.x,
    y: u ** 3 * segment.from.y + 3 * u ** 2 * t * segment.control1.y + 3 * u * t ** 2 * segment.control2.y + t ** 3 * segment.to.y,
  }
}

function isStraight(segment: NodeSystemCubicBezier): boolean {
  return collinear(segment.from, segment.control1, segment.to) &&
    collinear(segment.from, segment.control2, segment.to)
}

function lineBezier(from: NodeSystemPoint, to: NodeSystemPoint): NodeSystemCubicBezier {
  return {from, control1: lerp(from, to, 1 / 3), control2: lerp(from, to, 2 / 3), to}
}

function appendSegment(segments: NodeSystemCubicBezier[], segment: NodeSystemCubicBezier): void {
  if (distance(segment.from, segment.to) <= Number.EPSILON) return
  segments.push(segment)
}

function toward(from: NodeSystemPoint, to: NodeSystemPoint, amount: number): NodeSystemPoint {
  const length = distance(from, to)
  if (length <= Number.EPSILON) return from
  const ratio = amount / length
  return {x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio}
}

function lerp(from: NodeSystemPoint, to: NodeSystemPoint, t: number): NodeSystemPoint {
  return {x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t}
}

function distance(left: NodeSystemPoint, right: NodeSystemPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y)
}

function pointInsideRect(point: NodeSystemPoint, rect: NodeSystemRect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w &&
    point.y >= rect.y && point.y <= rect.y + rect.h
}

function stableIdCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function collinear(previous: NodeSystemPoint, corner: NodeSystemPoint, next: NodeSystemPoint): boolean {
  const cross = (corner.x - previous.x) * (next.y - corner.y) - (corner.y - previous.y) * (next.x - corner.x)
  return Math.abs(cross) < 1e-6
}
