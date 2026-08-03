import {
  MAX_FIELD_LAYOUT_COUNT,
  layoutFieldsInPseudoCircle,
  type PseudoCircleLayout,
  type PseudoSpherePoint,
} from "../src/FieldsLayout.ts"

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2
const SUNFLOWER_MINIMUM_UNIT_DISTANCE = 0.9

const centeredLayout = (
  rawPoints: readonly Readonly<{x: number; y: number}>[],
  markerRadius: number,
): PseudoCircleLayout => {
  const centerX = rawPoints.reduce((sum, point) => sum + point.x, 0) /
    rawPoints.length
  const centerY = rawPoints.reduce((sum, point) => sum + point.y, 0) /
    rawPoints.length
  const points = Object.freeze(rawPoints.map((point): PseudoSpherePoint =>
    Object.freeze({
      x: point.x - centerX,
      y: point.y - centerY,
      z: 0,
    })
  ))
  const radius = points.reduce(
    (maximum, point) => Math.max(maximum, Math.hypot(point.x, point.y)),
    0,
  ) + markerRadius
  return Object.freeze({points, radius})
}

const safeInputs = (
  count: number,
  markerRadius: number,
): Readonly<{count: number; markerRadius: number}> => {
  if (!Number.isFinite(count)) {
    throw new RangeError("Field packing count must be finite")
  }
  const safeCount = Math.max(1, Math.floor(count))
  if (safeCount > MAX_FIELD_LAYOUT_COUNT) {
    throw new RangeError(
      `Field packing count ${safeCount} exceeds ${MAX_FIELD_LAYOUT_COUNT}`,
    )
  }
  return Object.freeze({
    count: safeCount,
    markerRadius: Number.isFinite(markerRadius) ? Math.max(0, markerRadius) : 0,
  })
}

/**
 * Vogel's Fermat spiral. The 0.9 divisor is a conservative form of the
 * published ~0.90380 minimum separation in the unit-density sunflower set.
 */
export const layoutFieldsInSunflower = (
  count: number,
  markerRadius: number,
): PseudoCircleLayout => {
  const safe = safeInputs(count, markerRadius)
  const scale = safe.markerRadius * 2 / SUNFLOWER_MINIMUM_UNIT_DISTANCE
  return centeredLayout(Array.from({length: safe.count}, (_, index) => {
    const ordinal = index + 1
    const radius = Math.sqrt(ordinal / Math.PI) * scale
    const angle = Math.PI * 2 * ordinal * GOLDEN_RATIO
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }
  }), safe.markerRadius)
}

/** Former production control: one centered Field and one outer ring. */
export const layoutFieldsOnSingleRing = (
  count: number,
  markerRadius: number,
): PseudoCircleLayout => {
  const safe = safeInputs(count, markerRadius)
  const outerCount = safe.count - 1
  const ringRadius = outerCount === 0
    ? 0
    : Math.max(
        safe.markerRadius * 2,
        outerCount === 1
          ? 0
          : safe.markerRadius / Math.sin(Math.PI / outerCount),
      )
  const angleStep = outerCount === 0 ? 0 : Math.PI * 2 / outerCount
  const zeroThreshold = ringRadius * Number.EPSILON * 4
  const points = Object.freeze(Array.from(
    {length: safe.count},
    (_, index): PseudoSpherePoint => {
      if (index === 0) return Object.freeze({x: 0, y: 0, z: 0})
      const angle = -Math.PI / 2 + angleStep * (index - 1)
      const x = Math.cos(angle) * ringRadius
      const y = Math.sin(angle) * ringRadius
      return Object.freeze({
        x: Math.abs(x) <= zeroThreshold ? 0 : x,
        y: Math.abs(y) <= zeroThreshold ? 0 : y,
        z: 0,
      })
    },
  ))
  return Object.freeze({points, radius: ringRadius + safe.markerRadius})
}

/** The production concentric growth-front layout. */
export const layoutFieldsInGrowthRings = layoutFieldsInPseudoCircle

const HEX_DIRECTIONS = Object.freeze([
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
  [1, 0],
  [0, 1],
] as const)

/** One-pass triangular-lattice spiral with exact one-diameter neighbours. */
export const layoutFieldsInHexSpiral = (
  count: number,
  markerRadius: number,
): PseudoCircleLayout => {
  const safe = safeInputs(count, markerRadius)
  const diameter = safe.markerRadius * 2
  const axial: Array<Readonly<{column: number; row: number}>> = [
    {column: 0, row: 0},
  ]
  for (let ring = 1; axial.length < safe.count; ring += 1) {
    let column = ring
    let row = 0
    for (const [columnStep, rowStep] of HEX_DIRECTIONS) {
      for (let step = 0; step < ring && axial.length < safe.count; step += 1) {
        axial.push({column, row})
        column += columnStep
        row += rowStep
      }
    }
  }
  return centeredLayout(axial.map((point) => ({
    x: diameter * (point.column + point.row / 2),
    y: diameter * Math.sqrt(3) / 2 * point.row,
  })), safe.markerRadius)
}
