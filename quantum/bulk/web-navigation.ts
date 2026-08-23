import { Ray, Vector3 } from "@metafor/engine"
import type {BulkOrbitalParticleKind} from "@metafor/types/bulk/manifest"
import type {
  BulkClientPoint,
  BulkDarkParticlePickTarget,
  BulkFieldProxyPickTarget,
  BulkFieldParticlePickTarget,
  BulkHoverDirection,
  BulkHoverPriorityCandidate,
  BulkHoverTransitionResult,
  BulkOrbitalParticlePickTarget,
  BulkPickHit,
  BulkPickTarget,
  BulkViewportFitAxis,
  BulkViewportFocusPose,
  ResolveBulkHoverPriorityTargetOptions,
  ResolveBulkHoverTargetOptions,
  ResolveBulkHoverTransitionOptions,
  ResolveBulkPickTargetOptions,
  ResolveBulkViewportFitPoseOptions,
  ResolveBulkViewportFocusPoseOptions,
} from "@bulk/types/viewport"

const DEFAULT_HIT_PADDING_MM = 32
const DEFAULT_RETENTION_HIT_PADDING_MM = 44
const DEFAULT_FOCUS_MIN_SURFACE_CLEARANCE_MM = 2.5
const DEFAULT_FOCUS_SURFACE_CLEARANCE_RATIO = 0.4
const DEFAULT_HOVER_TRANSITION_DELAY_MS = 72
const DEFAULT_HOVER_SCORE_HYSTERESIS_PX = 6
const DEFAULT_DEEPER_TARGET_SCORE_TOLERANCE_PX = 4.0
const FALLBACK_VIEW_DIRECTION = new Vector3(0.72, -0.54, 0.42).normalize()

export const resolveBulkOrbitalPickDepth = (
  parentDarkDepth: number,
  kind: BulkOrbitalParticleKind,
): number => parentDarkDepth + (kind === "state" ? 1 : 2)

export const resolveBulkFieldProxyPickDepth = (
  parentDarkDepth: number,
): number => parentDarkDepth + 3

export const resolveBulkProjectedSphereHoverScore = (
  center: BulkClientPoint,
  clientX: number,
  clientY: number,
): number => Math.hypot(clientX - center.x, clientY - center.y)

export const resolveBulkProjectedTorusHoverScore = (
  center: BulkClientPoint,
  projectedInnerRadius: number,
  projectedOuterRadius: number,
  clientX: number,
  clientY: number,
): number => {
  const distanceFromCenter = Math.hypot(
    clientX - center.x,
    clientY - center.y,
  )
  const projectedCenterlineRadius =
    (projectedInnerRadius + projectedOuterRadius) / 2
  return Math.abs(distanceFromCenter - projectedCenterlineRadius)
}

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

const resolveFieldParticleHitDistance = (
  ray: Ray,
  target:
    | BulkFieldParticlePickTarget
    | Extract<BulkOrbitalParticlePickTarget, {form: "sphere"}>
    | Extract<BulkFieldProxyPickTarget, {form: "sphere"}>,
  hitPaddingMm: number,
): number | null => {
  const range = resolveRaySphereDistanceRange(ray, target.center, target.sphereRadius + hitPaddingMm)
  return range ? range.start : null
}

const getDarkParticleTorusSignedDistance = (
  point: Vector3,
  target:
    | BulkDarkParticlePickTarget
    | Extract<BulkOrbitalParticlePickTarget, {form: "torus"}>
    | Extract<BulkFieldProxyPickTarget, {form: "torus"}>,
  expandedTorusTube: number,
): number => {
  const localX = point.x - target.center.x
  const localY = point.y - target.center.y
  const localZ = point.z - target.center.z
  const radialDistance = Math.hypot(localX, localY)
  return Math.hypot(radialDistance - target.torusRadius, localZ) - expandedTorusTube
}

const resolveDarkParticleHitDistance = (
  ray: Ray,
  target:
    | BulkDarkParticlePickTarget
    | Extract<BulkOrbitalParticlePickTarget, {form: "torus"}>
    | Extract<BulkFieldProxyPickTarget, {form: "torus"}>,
  hitPaddingMm: number,
): number | null => {
  const expandedTorusTube = target.torusTube + hitPaddingMm
  const bounds = resolveRaySphereDistanceRange(ray, target.center, target.torusRadius + expandedTorusTube)
  if (!bounds) return null

  const epsilon = Math.max(0.75, expandedTorusTube * 0.02)
  let distance = bounds.start

  for (let step = 0; step < 48 && distance <= bounds.end; step += 1) {
    const point = ray.at(distance, new Vector3())
    const signedDistance = getDarkParticleTorusSignedDistance(point, target, expandedTorusTube)
    if (signedDistance <= epsilon) return distance
    distance += Math.max(signedDistance * 0.9, epsilon)
  }

  return null
}

const compareBulkPickHits = (left: BulkPickHit, right: BulkPickHit): number => {
  if (left.target.depth !== right.target.depth) return right.target.depth - left.target.depth
  return left.distance - right.distance
}

export const getBulkPickTargetKey = (target: BulkPickTarget): string => {
  if (target.kind === "darkParticle") return `darkParticle:${target.darkParticleId}`
  if (target.kind === "fieldParticle") return `fieldParticle:${target.fieldParticleId}`
  if (target.kind === "orbitalParticle") return `orbitalParticle:${target.orbitalParticleId}`
  return `fieldProxy:${target.fieldProxyId}`
}

export const isBulkSpherePickTarget = (
  target: BulkPickTarget,
): target is
  | BulkFieldParticlePickTarget
  | Extract<BulkOrbitalParticlePickTarget, {form: "sphere"}>
  | Extract<BulkFieldProxyPickTarget, {form: "sphere"}> =>
  target.kind === "fieldParticle" ||
  (
    (target.kind === "orbitalParticle" || target.kind === "fieldProxy") &&
    target.form === "sphere"
  )

const getPickParentDarkParticleId = (target: BulkPickTarget): number =>
  target.kind === "darkParticle"
    ? target.darkParticleId
    : target.parentDarkParticleId

const resolveDarkParticleDistanceToAncestor = (
  parentByDarkParticleId: ReadonlyMap<number, number | null>,
  ancestorDarkParticleId: number,
  descendantDarkParticleId: number,
): number | null => {
  let cursor: number | null = descendantDarkParticleId
  let distance = 0

  while (cursor !== null) {
    if (cursor === ancestorDarkParticleId) return distance
    cursor = parentByDarkParticleId.get(cursor) ?? null
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
  const distance = isBulkSpherePickTarget(target)
    ? resolveFieldParticleHitDistance(ray, target, hitPaddingMm)
    : resolveDarkParticleHitDistance(ray, target, hitPaddingMm)

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

export const resolveBulkClickTarget = (
  ray: Ray,
  targets: readonly BulkPickTarget[],
): BulkPickTarget | null => {
  let nearestHit: BulkPickHit | null = null

  for (const target of targets) {
    const hit = resolveBulkPickHit(ray, target, {hitPaddingMm: 0})
    if (!hit) continue
    if (
      nearestHit === null ||
      hit.distance < nearestHit.distance ||
      (
        hit.distance === nearestHit.distance &&
        hit.target.depth < nearestHit.target.depth
      )
    ) {
      nearestHit = hit
    }
  }

  return nearestHit?.target ?? null
}

/**
 * Chooses the exact surface used by click/tap navigation.
 *
 * A focused camera can be inside several nested transparent Tori at once. In
 * that case every enclosing surface starts at distance zero, so distance alone
 * cannot distinguish the immediate visual parent from the root. The closest
 * shallower visual depth is the deterministic parent step; a distinct hovered
 * Mesh is still resolved separately by resolveBulkNavigationClickTarget.
 */
export const resolveBulkNavigationSurfaceTarget = (
  currentTarget: BulkPickTarget | null,
  exactHits: readonly BulkPickHit[],
): BulkPickTarget | null => {
  let candidates = exactHits

  if (currentTarget !== null) {
    let parentDepth = Number.NEGATIVE_INFINITY
    for (const hit of exactHits) {
      if (hit.target.depth >= currentTarget.depth) continue
      parentDepth = Math.max(parentDepth, hit.target.depth)
    }
    if (Number.isFinite(parentDepth)) {
      candidates = exactHits.filter((hit) => hit.target.depth === parentDepth)
    }
  }

  let nearestHit: BulkPickHit | null = null
  for (const hit of candidates) {
    if (
      nearestHit === null ||
      hit.distance < nearestHit.distance ||
      (
        hit.distance === nearestHit.distance &&
        hit.target.depth < nearestHit.target.depth
      )
    ) {
      nearestHit = hit
    }
  }
  return nearestHit?.target ?? null
}

export const resolveBulkNavigationClickTarget = (
  currentTarget: BulkPickTarget | null,
  hoverTarget: BulkPickTarget | null,
  surfaceTarget: BulkPickTarget | null,
): BulkPickTarget | null => {
  const currentTargetKey = currentTarget === null
    ? null
    : getBulkPickTargetKey(currentTarget)
  const hoverTargetKey = hoverTarget === null
    ? null
    : getBulkPickTargetKey(hoverTarget)

  if (
    currentTarget !== null &&
    surfaceTarget !== null &&
    surfaceTarget.depth < currentTarget.depth &&
    (hoverTarget === null || hoverTargetKey === currentTargetKey)
  ) {
    return surfaceTarget
  }

  return hoverTarget ?? surfaceTarget
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
  const currentTargetKey = currentTarget ? getBulkPickTargetKey(currentTarget) : null
  const nextTargetKey = nextTarget ? getBulkPickTargetKey(nextTarget) : null
  const pendingTargetKey = pendingTarget ? getBulkPickTargetKey(pendingTarget) : null

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
  if (
    left.target.depth !== right.target.depth &&
    Math.abs(left.score - right.score) <=
      DEFAULT_DEEPER_TARGET_SCORE_TOLERANCE_PX
  ) {
    return compareBulkPickHits(left, right)
  }
  if (left.score !== right.score) return left.score - right.score
  return compareBulkPickHits(left, right)
}

export const resolveBulkHoverPriorityTarget = ({
  candidates,
  currentTarget,
  hysteresisPx = DEFAULT_HOVER_SCORE_HYSTERESIS_PX,
  parentByDarkParticleId,
}: ResolveBulkHoverPriorityTargetOptions): BulkPickTarget | null => {
  if (candidates.length === 0) return null

  const sortedCandidates = [...candidates].sort(compareBulkHoverPriorityCandidates)
  const bestCandidate = sortedCandidates[0]!
  if (!currentTarget) return bestCandidate.target

  const currentCandidate = sortedCandidates.find((candidate) =>
    getBulkPickTargetKey(candidate.target) === getBulkPickTargetKey(currentTarget)
  )
  if (!currentCandidate) return bestCandidate.target
  if (getBulkPickTargetKey(bestCandidate.target) === getBulkPickTargetKey(currentTarget)) return currentCandidate.target

  if (bestCandidate.target.depth === currentCandidate.target.depth) {
    return bestCandidate.target
  }

  if (parentByDarkParticleId) {
    const currentDarkParticleId = getPickParentDarkParticleId(currentTarget)
    const bestDarkParticleId = getPickParentDarkParticleId(bestCandidate.target)
    const descendantDistance = resolveDarkParticleDistanceToAncestor(
      parentByDarkParticleId,
      currentDarkParticleId,
      bestDarkParticleId,
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
  parentByDarkParticleId: ReadonlyMap<number, number | null>,
): BulkPickTarget | null => {
  if (!currentTarget) return hits[0]?.target ?? null

  const currentTargetKey = getBulkPickTargetKey(currentTarget)
  const currentDarkParticleId = getPickParentDarkParticleId(currentTarget)
  const selfHit = hits.find((hit) =>
    getBulkPickTargetKey(hit.target) === currentTargetKey
  )

  if (hoverDirection > 0) {
    if (selfHit) return selfHit.target

    let closestAncestorHit: BulkPickHit | null = null
    let ancestorDarkParticleId = parentByDarkParticleId.get(currentDarkParticleId) ?? null

    while (ancestorDarkParticleId !== null) {
      const ancestorHit = hits.find((hit) => getPickParentDarkParticleId(hit.target) === ancestorDarkParticleId)
      if (ancestorHit) {
        closestAncestorHit = ancestorHit
        break
      }
      ancestorDarkParticleId = parentByDarkParticleId.get(ancestorDarkParticleId) ?? null
    }

    if (closestAncestorHit) return closestAncestorHit.target
  }

  if (hoverDirection < 0) {
    let closestDescendantHit: BulkPickHit | null = null
    let closestDescendantDistance = Number.POSITIVE_INFINITY

    for (const hit of hits) {
      const candidateDarkParticleId = getPickParentDarkParticleId(hit.target)
      if (candidateDarkParticleId === currentDarkParticleId) continue

      const distanceToCurrent = resolveDarkParticleDistanceToAncestor(
        parentByDarkParticleId,
        currentDarkParticleId,
        candidateDarkParticleId,
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
  centerProjectedBounds = true,
  currentPosition,
  currentTarget,
  fitAxis = "auto",
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
  const safeFitAxis: BulkViewportFitAxis = fitAxis === "height" || fitAxis === "width" ? fitAxis : "auto"
  const safeHalfHorizontalFov = Math.max(0.1, Math.atan(Math.tan(safeHalfVerticalFov) * safeAspect))
  const verticalTan = Math.tan(safeHalfVerticalFov)
  const horizontalTan = Math.tan(safeHalfHorizontalFov)
  const pointFitDistance = resolveProjectedFitDistance({
    direction: safeDirection,
    fitAxis: safeFitAxis,
    horizontalTan,
    paddingRatio: safePaddingRatio,
    points,
    radius: safeRadius,
    target,
    up,
    verticalTan,
  })
  const heightFitDistance = (safeRadius * safePaddingRatio) / verticalTan
  const widthFitDistance = (safeRadius * safePaddingRatio) / horizontalTan
  let fitDistance = pointFitDistance ?? (
    safeFitAxis === "width"
      ? widthFitDistance
      : safeFitAxis === "height"
        ? heightFitDistance
        : Math.max(heightFitDistance, widthFitDistance)
  )
  const fitTarget = target.clone()
  if (centerProjectedBounds) {
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
        fitAxis: safeFitAxis,
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
  fitAxis,
  horizontalTan,
  paddingRatio,
  points,
  radius,
  target,
  up,
  verticalTan,
}: {
  direction: Vector3
  fitAxis: BulkViewportFitAxis
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
    const widthDistance = (x * paddingRatio) / safeHorizontalTan - depthOffset
    const heightDistance = (y * paddingRatio) / safeVerticalTan - depthOffset
    distance = Math.max(
      distance,
      fitAxis === "width"
        ? widthDistance
        : fitAxis === "height"
          ? heightDistance
          : Math.max(widthDistance, heightDistance),
    )
    projected = true
  }

  return projected && Number.isFinite(distance) ? Math.max(1e-3, distance) : null
}
