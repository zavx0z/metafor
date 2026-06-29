import { Ray, Vector3 } from "@metafor/engine"

export interface BulkShellPickTarget {
  center: Vector3
  depth: number
  kind: "shell"
  outerRadius: number
  parentParticleId: number | null
  particleId: number
  shellRadius: number
  shellTube: number
}

export interface BulkFieldPickTarget {
  center: Vector3
  depth: number
  particleId: number
  fieldId: number
  kind: "field"
  outerRadius: number
  sphereRadius: number
}

export type BulkPickTarget = BulkShellPickTarget | BulkFieldPickTarget

export interface ResolveBulkPickTargetOptions {
  hitPaddingMm?: number
}

export interface ResolveBulkHoverTargetOptions extends ResolveBulkPickTargetOptions {
  retentionHitPaddingMm?: number
}

export interface BulkPickHit {
  distance: number
  target: BulkPickTarget
}

export interface ResolveBulkViewportFocusPoseOptions {
  currentPosition: Vector3
  currentTarget: Vector3
  focusRadius: number
  fovRad: number
  nextTarget: Vector3
}

export interface ResolveBulkViewportFitPoseOptions {
  aspect: number
  currentPosition: Vector3
  currentTarget: Vector3
  fovRad: number
  paddingRatio?: number
  points?: readonly Vector3[]
  radius: number
  target: Vector3
  up?: Vector3
}

export interface BulkViewportFocusPose {
  position: Vector3
  target: Vector3
}

export interface ResolveBulkHoverTransitionOptions {
  currentTarget: BulkPickTarget | null
  delayMs?: number
  nextTarget: BulkPickTarget | null
  nowMs: number
  pendingStartedAtMs: number | null
  pendingTarget: BulkPickTarget | null
}

export interface BulkHoverTransitionResult {
  committedTarget: BulkPickTarget | null
  pendingStartedAtMs: number | null
  pendingTarget: BulkPickTarget | null
}

export interface BulkHoverPriorityCandidate extends BulkPickHit {
  score: number
}

export interface ResolveBulkHoverPriorityTargetOptions {
  candidates: readonly BulkHoverPriorityCandidate[]
  currentTarget: BulkPickTarget | null
  hysteresisPx?: number
  parentByParticleId?: ReadonlyMap<number, number | null>
}

export interface BulkClientPoint {
  x: number
  y: number
}

export type BulkHoverDirection = -1 | 0 | 1

const DEFAULT_HIT_PADDING_MM = 32
const DEFAULT_RETENTION_HIT_PADDING_MM = 44
const DEFAULT_FOCUS_MIN_SURFACE_CLEARANCE_MM = 2.5
const DEFAULT_FOCUS_SURFACE_CLEARANCE_RATIO = 0.4
const DEFAULT_HOVER_TRANSITION_DELAY_MS = 72
const DEFAULT_HOVER_SCORE_HYSTERESIS_PX = 6
const DEFAULT_DEEPER_TARGET_SCORE_TOLERANCE_PX = 4.0
const FALLBACK_VIEW_DIRECTION = new Vector3(0.72, -0.54, 0.42).normalize()

const resolveRaySphereDistanceRange = (
  ray: Ray,
  center: Vector3,
  radius: number,
): { end: number; start: number } | null => {
  const toCenter = center.clone().sub(ray.origin)
  const projection = toCenter.dot(ray.direction)
  const perpendicularSq = toCenter.dot(toCenter) - projection * projection
  const radiusSq = radius * radius

  if (perpendicularSq > radiusSq) return null

  const offset = Math.sqrt(radiusSq - perpendicularSq)
  const entry = projection - offset
  const exit = projection + offset

  if (exit < 0) return null

  return {
    start: Math.max(0, entry),
    end: exit,
  }
}

const resolveFieldHitDistance = (
  ray: Ray,
  target: BulkFieldPickTarget,
  hitPaddingMm: number,
): number | null => {
  const range = resolveRaySphereDistanceRange(ray, target.center, target.sphereRadius + hitPaddingMm)
  return range ? range.start : null
}

const getShellSignedDistance = (
  point: Vector3,
  target: BulkShellPickTarget,
  expandedShellTube: number,
): number => {
  const localX = point.x - target.center.x
  const localY = point.y - target.center.y
  const localZ = point.z - target.center.z
  const radialDistance = Math.hypot(localX, localY)
  return Math.hypot(radialDistance - target.shellRadius, localZ) - expandedShellTube
}

const resolveShellHitDistance = (
  ray: Ray,
  target: BulkShellPickTarget,
  hitPaddingMm: number,
): number | null => {
  const expandedShellTube = target.shellTube + hitPaddingMm
  const bounds = resolveRaySphereDistanceRange(ray, target.center, target.shellRadius + expandedShellTube)
  if (!bounds) return null

  const epsilon = Math.max(0.75, expandedShellTube * 0.02)
  let distance = bounds.start

  for (let step = 0; step < 48 && distance <= bounds.end; step += 1) {
    const point = ray.at(distance, new Vector3())
    const signedDistance = getShellSignedDistance(point, target, expandedShellTube)
    if (signedDistance <= epsilon) return distance
    distance += Math.max(signedDistance * 0.9, epsilon)
  }

  return null
}

const compareBulkPickHits = (left: BulkPickHit, right: BulkPickHit): number => {
  if (left.target.depth !== right.target.depth) return right.target.depth - left.target.depth
  return left.distance - right.distance
}

const getPickTargetKey = (target: BulkPickTarget): string => {
  return target.kind === "field" ? `field:${target.fieldId}` : `shell:${target.particleId}`
}

const getPickParticleId = (target: BulkPickTarget): number => target.particleId

const resolveParticleDistanceToAncestor = (
  parentByParticleId: ReadonlyMap<number, number | null>,
  ancestorParticleId: number,
  descendantParticleId: number,
): number | null => {
  let cursor: number | null = descendantParticleId
  let distance = 0

  while (cursor !== null) {
    if (cursor === ancestorParticleId) return distance
    cursor = parentByParticleId.get(cursor) ?? null
    distance += 1
  }

  return null
}

export const resolveBulkPickHit = (
  ray: Ray,
  target: BulkPickTarget,
  options: ResolveBulkPickTargetOptions = {},
): BulkPickHit | null => {
  const hitPaddingMm = options.hitPaddingMm ?? DEFAULT_HIT_PADDING_MM
  const distance = target.kind === "field"
    ? resolveFieldHitDistance(ray, target, hitPaddingMm)
    : resolveShellHitDistance(ray, target, hitPaddingMm)

  return distance === null ? null : { target, distance }
}

export const resolveBulkPickHits = (
  ray: Ray,
  targets: readonly BulkPickTarget[],
  options: ResolveBulkPickTargetOptions = {},
): BulkPickHit[] => {
  const hits: BulkPickHit[] = []

  for (const target of targets) {
    const hit = resolveBulkPickHit(ray, target, options)
    if (!hit) continue
    hits.push(hit)
  }

  hits.sort(compareBulkPickHits)
  return hits
}

export const resolveBulkHoverDirection = (
  previousPoint: BulkClientPoint,
  currentPoint: BulkClientPoint,
  centerPoint: BulkClientPoint,
  deadZonePx: number = 0.5,
): BulkHoverDirection => {
  const previousRadius = Math.hypot(previousPoint.x - centerPoint.x, previousPoint.y - centerPoint.y)
  const currentRadius = Math.hypot(currentPoint.x - centerPoint.x, currentPoint.y - centerPoint.y)
  const radialDelta = currentRadius - previousRadius

  if (!Number.isFinite(radialDelta) || Math.abs(radialDelta) <= deadZonePx) return 0
  return radialDelta > 0 ? 1 : -1
}

export const resolveBulkHoverTransition = ({
  currentTarget,
  delayMs = DEFAULT_HOVER_TRANSITION_DELAY_MS,
  nextTarget,
  nowMs,
  pendingStartedAtMs,
  pendingTarget,
}: ResolveBulkHoverTransitionOptions): BulkHoverTransitionResult => {
  const currentTargetKey = currentTarget ? getPickTargetKey(currentTarget) : null
  const nextTargetKey = nextTarget ? getPickTargetKey(nextTarget) : null
  const pendingTargetKey = pendingTarget ? getPickTargetKey(pendingTarget) : null

  if (nextTargetKey === currentTargetKey) {
    return {
      committedTarget: currentTarget,
      pendingTarget: null,
      pendingStartedAtMs: null,
    }
  }

  if (pendingStartedAtMs === null || nextTargetKey !== pendingTargetKey) {
    return {
      committedTarget: currentTarget,
      pendingTarget: nextTarget,
      pendingStartedAtMs: nowMs,
    }
  }

  if (nowMs - pendingStartedAtMs < delayMs) {
    return {
      committedTarget: currentTarget,
      pendingTarget,
      pendingStartedAtMs,
    }
  }

  return {
    committedTarget: nextTarget,
    pendingTarget: null,
    pendingStartedAtMs: null,
  }
}

const compareBulkHoverPriorityCandidates = (
  left: BulkHoverPriorityCandidate,
  right: BulkHoverPriorityCandidate,
): number => {
  if (Math.abs(left.score - right.score) <= DEFAULT_DEEPER_TARGET_SCORE_TOLERANCE_PX) {
    return compareBulkPickHits(left, right)
  }
  if (left.score !== right.score) return left.score - right.score
  return compareBulkPickHits(left, right)
}

export const resolveBulkHoverPriorityTarget = ({
  candidates,
  currentTarget,
  hysteresisPx = DEFAULT_HOVER_SCORE_HYSTERESIS_PX,
  parentByParticleId,
}: ResolveBulkHoverPriorityTargetOptions): BulkPickTarget | null => {
  if (candidates.length === 0) return null

  const sortedCandidates = [...candidates].sort(compareBulkHoverPriorityCandidates)
  const bestCandidate = sortedCandidates[0]!
  if (!currentTarget) return bestCandidate.target

  const currentCandidate = sortedCandidates.find((candidate) => getPickTargetKey(candidate.target) === getPickTargetKey(currentTarget))
  if (!currentCandidate) return bestCandidate.target
  if (getPickTargetKey(bestCandidate.target) === getPickTargetKey(currentTarget)) return currentCandidate.target

  if (parentByParticleId) {
    const currentParticleId = getPickParticleId(currentTarget)
    const bestParticleId = getPickParticleId(bestCandidate.target)
    const descendantDistance = resolveParticleDistanceToAncestor(
      parentByParticleId,
      currentParticleId,
      bestParticleId,
    )

    if (descendantDistance !== null && descendantDistance > 0) {
      return bestCandidate.target
    }
  }

  if (bestCandidate.target.depth > currentCandidate.target.depth) {
    return bestCandidate.target
  }

  if (currentCandidate.score <= bestCandidate.score + hysteresisPx) return currentCandidate.target
  return bestCandidate.target
}

export const resolveBulkDirectionalHoverTarget = (
  hits: readonly BulkPickHit[],
  currentTarget: BulkPickTarget | null,
  hoverDirection: BulkHoverDirection,
  parentByParticleId: ReadonlyMap<number, number | null>,
): BulkPickTarget | null => {
  if (!currentTarget) return hits[0]?.target ?? null

  const currentTargetKey = getPickTargetKey(currentTarget)
  const currentParticleId = getPickParticleId(currentTarget)
  const selfHit = hits.find((hit) => getPickTargetKey(hit.target) === currentTargetKey)

  if (hoverDirection > 0) {
    if (selfHit) return selfHit.target

    let closestAncestorHit: BulkPickHit | null = null
    let ancestorParticleId = parentByParticleId.get(currentParticleId) ?? null

    while (ancestorParticleId !== null) {
      const ancestorHit = hits.find((hit) => getPickParticleId(hit.target) === ancestorParticleId)
      if (ancestorHit) {
        closestAncestorHit = ancestorHit
        break
      }
      ancestorParticleId = parentByParticleId.get(ancestorParticleId) ?? null
    }

    if (closestAncestorHit) return closestAncestorHit.target
  }

  if (hoverDirection < 0) {
    let closestDescendantHit: BulkPickHit | null = null
    let closestDescendantDistance = Number.POSITIVE_INFINITY

    for (const hit of hits) {
      const candidateParticleId = getPickParticleId(hit.target)
      if (candidateParticleId === currentParticleId) continue

      const distanceToCurrent = resolveParticleDistanceToAncestor(
        parentByParticleId,
        currentParticleId,
        candidateParticleId,
      )
      if (distanceToCurrent === null || distanceToCurrent <= 0) continue
      if (distanceToCurrent > closestDescendantDistance) continue

      if (
        distanceToCurrent === closestDescendantDistance &&
        closestDescendantHit &&
        compareBulkPickHits(hit, closestDescendantHit) >= 0
      ) {
        continue
      }

      closestDescendantDistance = distanceToCurrent
      closestDescendantHit = hit
    }

    if (closestDescendantHit) return closestDescendantHit.target
    if (selfHit) return selfHit.target
  }

  return hits[0]?.target ?? selfHit?.target ?? null
}

export const resolveBulkPickTarget = (
  ray: Ray,
  targets: readonly BulkPickTarget[],
  options: ResolveBulkPickTargetOptions = {},
): BulkPickTarget | null => {
  return resolveBulkPickHits(ray, targets, options)[0]?.target ?? null
}

export const resolveBulkHoverTarget = (
  ray: Ray,
  targets: readonly BulkPickTarget[],
  currentTarget: BulkPickTarget | null,
  options: ResolveBulkHoverTargetOptions = {},
): BulkPickTarget | null => {
  const nextTarget = resolveBulkPickTarget(ray, targets, options)
  if (nextTarget) return nextTarget
  if (!currentTarget) return null

  const retainedHit = resolveBulkPickHit(ray, currentTarget, {
    hitPaddingMm: options.retentionHitPaddingMm ?? DEFAULT_RETENTION_HIT_PADDING_MM,
  })

  return retainedHit ? currentTarget : null
}

export const resolveBulkViewportFocusPose = ({
  currentPosition,
  currentTarget,
  focusRadius,
  fovRad,
  nextTarget,
}: ResolveBulkViewportFocusPoseOptions): BulkViewportFocusPose => {
  const direction = currentPosition.clone().sub(currentTarget)
  const safeDirection = direction.length() > 1e-6 ? direction.normalize() : FALLBACK_VIEW_DIRECTION.clone()
  const safeFocusRadius = Math.max(1e-3, focusRadius)
  const safeHalfFov = Math.max(0.1, fovRad / 2)
  const framingDistance = (safeFocusRadius * 1.25) / Math.tan(safeHalfFov)
  const surfaceClearanceDistance =
    safeFocusRadius +
    Math.max(DEFAULT_FOCUS_MIN_SURFACE_CLEARANCE_MM, safeFocusRadius * DEFAULT_FOCUS_SURFACE_CLEARANCE_RATIO)
  const focusDistance = Math.max(
    surfaceClearanceDistance,
    framingDistance,
  )

  return {
    target: nextTarget.clone(),
    position: nextTarget.clone().add(safeDirection.multiplyScalar(focusDistance)),
  }
}

export const resolveBulkViewportFitPose = ({
  aspect,
  currentPosition,
  currentTarget,
  fovRad,
  paddingRatio = 1.08,
  points = [],
  radius,
  target,
  up,
}: ResolveBulkViewportFitPoseOptions): BulkViewportFocusPose => {
  const direction = currentPosition.clone().sub(currentTarget)
  const safeDirection = direction.length() > 1e-6 ? direction.normalize() : FALLBACK_VIEW_DIRECTION.clone()
  const safeRadius = Math.max(1e-3, radius)
  const safePaddingRatio = Number.isFinite(paddingRatio) ? Math.max(1, paddingRatio) : 1.08
  const safeHalfVerticalFov = Math.max(0.1, fovRad / 2)
  const safeAspect = Math.max(0.1, aspect)
  const safeHalfHorizontalFov = Math.max(0.1, Math.atan(Math.tan(safeHalfVerticalFov) * safeAspect))
  const verticalTan = Math.tan(safeHalfVerticalFov)
  const horizontalTan = Math.tan(safeHalfHorizontalFov)
  const pointFitDistance = resolveProjectedFitDistance({
    direction: safeDirection,
    horizontalTan,
    paddingRatio: safePaddingRatio,
    points,
    radius: safeRadius,
    target,
    up,
    verticalTan,
  })
  let fitDistance = pointFitDistance ?? Math.max(
    (safeRadius * safePaddingRatio) / verticalTan,
    (safeRadius * safePaddingRatio) / horizontalTan,
  )
  const fitTarget = target.clone()
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const centerOffset = resolveProjectedFitCenterOffset({
      direction: safeDirection,
      fitDistance,
      horizontalTan,
      points,
      target: fitTarget,
      up,
      verticalTan,
    })
    if (centerOffset === null) break
    fitTarget.add(centerOffset)
    const nextFitDistance = resolveProjectedFitDistance({
      direction: safeDirection,
      horizontalTan,
      paddingRatio: safePaddingRatio,
      points,
      radius: safeRadius,
      target: fitTarget,
      up,
      verticalTan,
    })
    if (nextFitDistance !== null) fitDistance = nextFitDistance
  }

  return {
    target: fitTarget,
    position: fitTarget.clone().add(safeDirection.multiplyScalar(fitDistance)),
  }
}

const resolveProjectedFitCenterOffset = ({
  direction,
  fitDistance,
  horizontalTan,
  points,
  target,
  up,
  verticalTan,
}: {
  direction: Vector3
  fitDistance: number
  horizontalTan: number
  points: readonly Vector3[]
  target: Vector3
  up: Vector3 | undefined
  verticalTan: number
}): Vector3 | null => {
  if (points.length === 0 || !Number.isFinite(fitDistance) || fitDistance <= 1e-6) return null
  const forward = direction.clone().negate()
  const upSource = up && up.length() > 1e-6 ? up.clone().normalize() : new Vector3(0, 0, 1)
  let right = forward.clone().cross(upSource)
  if (right.length() <= 1e-6) right = forward.clone().cross(new Vector3(1, 0, 0))
  if (right.length() <= 1e-6) right = new Vector3(1, 0, 0)
  right.normalize()
  const screenUp = right.clone().cross(forward).normalize()
  const safeHorizontalTan = Math.max(1e-3, horizontalTan)
  const safeVerticalTan = Math.max(1e-3, verticalTan)
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let projected = false

  for (const point of points) {
    const offset = point.clone().sub(target)
    const depth = fitDistance + offset.dot(forward)
    if (!Number.isFinite(depth) || depth <= 1e-6) continue
    const x = offset.dot(right) / (depth * safeHorizontalTan)
    const y = offset.dot(screenUp) / (depth * safeVerticalTan)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    projected = true
  }

  if (!projected) return null
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const offsetX = centerX * fitDistance * safeHorizontalTan
  const offsetY = centerY * fitDistance * safeVerticalTan
  if (Math.abs(offsetX) <= 1e-6 && Math.abs(offsetY) <= 1e-6) return null
  return right.multiplyScalar(offsetX).add(screenUp.multiplyScalar(offsetY))
}

const resolveProjectedFitDistance = ({
  direction,
  horizontalTan,
  paddingRatio,
  points,
  radius,
  target,
  up,
  verticalTan,
}: {
  direction: Vector3
  horizontalTan: number
  paddingRatio: number
  points: readonly Vector3[]
  radius: number
  target: Vector3
  up: Vector3 | undefined
  verticalTan: number
}): number | null => {
  if (points.length === 0) return null
  const forward = direction.clone().negate()
  const upSource = up && up.length() > 1e-6 ? up.clone().normalize() : new Vector3(0, 0, 1)
  let right = forward.clone().cross(upSource)
  if (right.length() <= 1e-6) right = forward.clone().cross(new Vector3(1, 0, 0))
  if (right.length() <= 1e-6) right = new Vector3(1, 0, 0)
  right.normalize()
  const screenUp = right.clone().cross(forward).normalize()
  const safeHorizontalTan = Math.max(1e-3, horizontalTan)
  const safeVerticalTan = Math.max(1e-3, verticalTan)
  let distance = Math.max(1e-3, radius * 0.25)
  let projected = false

  for (const point of points) {
    const offset = point.clone().sub(target)
    const depthOffset = offset.dot(forward)
    const x = Math.abs(offset.dot(right))
    const y = Math.abs(offset.dot(screenUp))
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(depthOffset)) continue
    distance = Math.max(
      distance,
      (x * paddingRatio) / safeHorizontalTan - depthOffset,
      (y * paddingRatio) / safeVerticalTan - depthOffset,
    )
    projected = true
  }

  return projected && Number.isFinite(distance) ? Math.max(1e-3, distance) : null
}
