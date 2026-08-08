import type {NodeSystemPoint} from "./model.ts"

export const NODE_SYSTEM_EDGE_PARTICLE_DURATION_MS = 1_200
export const NODE_SYSTEM_EDGE_PARTICLE_TAIL_PX = 84

export type NodeSystemEdgeMessage = Readonly<{
  id: string
  edgeId: string
  direction: "forward" | "reverse"
  at: number
  messageClass?: string
}>

export type NodeSystemEdgeParticlePlan = Readonly<{
  head: NodeSystemPoint
  tail: readonly Readonly<{
    from: NodeSystemPoint
    to: NodeSystemPoint
    opacity: number
    thickness: number
  }>[]
}>

/** Plans one particle and its piecewise gradient tail on a sampled Bézier route. */
export function planNodeSystemEdgeParticle(
  stroke: readonly NodeSystemPoint[],
  message: NodeSystemEdgeMessage,
  now: number,
  durationMs = NODE_SYSTEM_EDGE_PARTICLE_DURATION_MS,
  tailPx = NODE_SYSTEM_EDGE_PARTICLE_TAIL_PX,
  tailSteps = 12,
): NodeSystemEdgeParticlePlan | null {
  if (stroke.length < 2 || !Number.isFinite(now) || !Number.isFinite(message.at)) return null
  const duration = Number.isFinite(durationMs) ? Math.max(1, durationMs) : NODE_SYSTEM_EDGE_PARTICLE_DURATION_MS
  const elapsed = now - message.at
  if (elapsed < 0 || elapsed >= duration) return null
  const path = measurePath(stroke)
  if (path.total <= Number.EPSILON) return null
  const forwardProgress = Math.min(1, Math.max(0, elapsed / duration))
  const headDistance = path.total * (message.direction === "forward" ? forwardProgress : 1 - forwardProgress)
  const travelSign = message.direction === "forward" ? 1 : -1
  const availableTail = Math.min(Math.max(0, tailPx), message.direction === "forward" ? headDistance : path.total - headDistance)
  const steps = Math.max(1, Math.floor(tailSteps))
  const tail: Array<{from: NodeSystemPoint; to: NodeSystemPoint; opacity: number; thickness: number}> = []
  for (let index = 0; index < steps; index += 1) {
    const near = headDistance - travelSign * availableTail * (index / steps)
    const far = headDistance - travelSign * availableTail * ((index + 1) / steps)
    const strength = 1 - (index + 0.5) / steps
    tail.push({
      from: pointAtDistance(stroke, path.lengths, near),
      to: pointAtDistance(stroke, path.lengths, far),
      opacity: 0.08 + strength * 0.72,
      thickness: 0.7 + strength * 2.1,
    })
  }
  return {head: pointAtDistance(stroke, path.lengths, headDistance), tail}
}

function measurePath(points: readonly NodeSystemPoint[]): {lengths: readonly number[]; total: number} {
  const lengths = [0]
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y)
    lengths.push(total)
  }
  return {lengths, total}
}

function pointAtDistance(
  points: readonly NodeSystemPoint[],
  lengths: readonly number[],
  requested: number,
): NodeSystemPoint {
  const total = lengths.at(-1) ?? 0
  const distance = Math.min(total, Math.max(0, requested))
  for (let index = 1; index < lengths.length; index += 1) {
    const segmentEnd = lengths[index]!
    if (distance > segmentEnd) continue
    const segmentStart = lengths[index - 1]!
    const span = segmentEnd - segmentStart
    if (span <= Number.EPSILON) return points[index]!
    const ratio = (distance - segmentStart) / span
    const from = points[index - 1]!
    const to = points[index]!
    return {x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio}
  }
  return points.at(-1) ?? {x: 0, y: 0}
}
