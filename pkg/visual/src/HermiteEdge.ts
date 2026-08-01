export const HERMITE_EDGE_SEGMENTS = 64

export type HermiteEdgePoint = Readonly<{
  x: number
  y: number
  z: number
}>

export type HermiteEdgePathInput = Readonly<{
  from: HermiteEdgePoint
  leftOuterRadius: number
  rightOuterRadius: number
  side?: -1 | 1
  to: HermiteEdgePoint
}>

const finitePoint = (
  point: HermiteEdgePoint,
  label: string,
): HermiteEdgePoint => {
  if (![point.x, point.y, point.z].every(Number.isFinite)) {
    throw new RangeError(`Visual Hermite Edge ${label} must be finite`)
  }
  return point
}

const tangentLengths = (
  span: number,
  leftOuterRadius: number,
  rightOuterRadius: number,
): Readonly<{left: number; right: number}> => {
  const baseHeight = Math.max(0, span) * 2 / 3
  const leftWeight = Math.sqrt(
    Math.max(Number.EPSILON, leftOuterRadius),
  )
  const rightWeight = Math.sqrt(
    Math.max(Number.EPSILON, rightOuterRadius),
  )
  const weightMean = (leftWeight + rightWeight) / 2
  return {
    left: Math.max(0.01, baseHeight * leftWeight / weightMean * 3),
    right: Math.max(0.01, baseHeight * rightWeight / weightMean * 3),
  }
}

/**
 * Samples the approved cubic Hermite beam used by the composed Visual
 * playground. Endpoint directions are the normals of the common Torus plane;
 * unequal form sizes only redistribute the two tangent magnitudes.
 */
export const buildHermiteEdgePath = ({
  from: sourceFrom,
  leftOuterRadius,
  rightOuterRadius,
  side = 1,
  to: sourceTo,
}: HermiteEdgePathInput): readonly HermiteEdgePoint[] => {
  const from = finitePoint(sourceFrom, "source")
  const to = finitePoint(sourceTo, "target")
  const span = Math.hypot(
    to.x - from.x,
    to.y - from.y,
    to.z - from.z,
  )
  const lengths = tangentLengths(
    span,
    Math.max(Number.EPSILON, leftOuterRadius),
    Math.max(Number.EPSILON, rightOuterRadius),
  )
  const leftTangent = side * lengths.left
  const rightTangent = -side * lengths.right
  return Object.freeze(Array.from(
    {length: HERMITE_EDGE_SEGMENTS + 1},
    (_, index) => {
      const t = index / HERMITE_EDGE_SEGMENTS
      const t2 = t * t
      const t3 = t2 * t
      const h00 = 2 * t3 - 3 * t2 + 1
      const h10 = t3 - 2 * t2 + t
      const h01 = -2 * t3 + 3 * t2
      const h11 = t3 - t2
      return Object.freeze({
        x: h00 * from.x + h01 * to.x,
        y: h00 * from.y + h01 * to.y,
        z:
          h00 * from.z +
          h10 * leftTangent +
          h01 * to.z +
          h11 * rightTangent,
      })
    },
  ))
}
