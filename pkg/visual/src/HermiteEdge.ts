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

/**
 * Complete cubic Hermite geometry before tessellation.
 *
 * Layout owns these endpoints and derivatives. A transport may carry them to a
 * browser, which can reconstruct the approved fixed-resolution path without
 * choosing a curve or re-running layout.
 */
export type HermiteEdgeCurve = Readonly<{
  from: HermiteEdgePoint
  fromTangent: HermiteEdgePoint
  to: HermiteEdgePoint
  toTangent: HermiteEdgePoint
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

const immutablePoint = (
  point: HermiteEdgePoint,
  label: string,
): HermiteEdgePoint => {
  finitePoint(point, label)
  return Object.freeze({x: point.x, y: point.y, z: point.z})
}

const hermiteCoordinate = (
  from: number,
  fromTangent: number,
  to: number,
  toTangent: number,
  index: number,
): number => {
  const t = index / HERMITE_EDGE_SEGMENTS
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  return h00 * from + h10 * fromTangent + h01 * to + h11 * toTangent
}

const validateCurve = (curve: HermiteEdgeCurve): HermiteEdgeCurve => {
  finitePoint(curve.from, "source")
  finitePoint(curve.to, "target")
  finitePoint(curve.fromTangent, "source tangent")
  finitePoint(curve.toTangent, "target tangent")
  return curve
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
 * Describes the approved cubic Hermite beam used by the composed Visual
 * scene. Endpoint directions are the normals of the common Torus plane;
 * unequal form sizes only redistribute the two tangent magnitudes.
 */
export const describeHermiteEdgeCurve = ({
  from: sourceFrom,
  leftOuterRadius,
  rightOuterRadius,
  side = 1,
  to: sourceTo,
}: HermiteEdgePathInput): HermiteEdgeCurve => {
  const from = immutablePoint(sourceFrom, "source")
  const to = immutablePoint(sourceTo, "target")
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
  return Object.freeze({
    from,
    fromTangent: Object.freeze({x: 0, y: 0, z: leftTangent}),
    to,
    toTangent: Object.freeze({x: 0, y: 0, z: rightTangent}),
  })
}

/** Samples one already-described curve using the approved 64-segment law. */
export const sampleHermiteEdgeCurve = (
  sourceCurve: HermiteEdgeCurve,
): readonly HermiteEdgePoint[] => {
  const curve = validateCurve(sourceCurve)
  return Object.freeze(Array.from(
    {length: HERMITE_EDGE_SEGMENTS + 1},
    (_, index) => Object.freeze({
      x: hermiteCoordinate(
        curve.from.x,
        curve.fromTangent.x,
        curve.to.x,
        curve.toTangent.x,
        index,
      ),
      y: hermiteCoordinate(
        curve.from.y,
        curve.fromTangent.y,
        curve.to.y,
        curve.toTangent.y,
        index,
      ),
      z: hermiteCoordinate(
        curve.from.z,
        curve.fromTangent.z,
        curve.to.z,
        curve.toTangent.z,
        index,
      ),
    }),
  ))
}

/**
 * Tessellates one curve straight into an existing line-segment buffer.
 * The returned offset is measured in Float32 scalars, not bytes.
 */
export const writeHermiteEdgeSegments = (
  sourceCurve: HermiteEdgeCurve,
  target: Float32Array,
  offset = 0,
): number => {
  const curve = validateCurve(sourceCurve)
  const scalarCount = HERMITE_EDGE_SEGMENTS * 6
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset + scalarCount > target.length
  ) {
    throw new RangeError("Visual Hermite Edge segment buffer is too small")
  }
  let writeOffset = offset
  let previousX = curve.from.x
  let previousY = curve.from.y
  let previousZ = curve.from.z
  for (let index = 1; index <= HERMITE_EDGE_SEGMENTS; index += 1) {
    const nextX = hermiteCoordinate(
      curve.from.x,
      curve.fromTangent.x,
      curve.to.x,
      curve.toTangent.x,
      index,
    )
    const nextY = hermiteCoordinate(
      curve.from.y,
      curve.fromTangent.y,
      curve.to.y,
      curve.toTangent.y,
      index,
    )
    const nextZ = hermiteCoordinate(
      curve.from.z,
      curve.fromTangent.z,
      curve.to.z,
      curve.toTangent.z,
      index,
    )
    target[writeOffset] = previousX
    target[writeOffset + 1] = previousY
    target[writeOffset + 2] = previousZ
    target[writeOffset + 3] = nextX
    target[writeOffset + 4] = nextY
    target[writeOffset + 5] = nextZ
    writeOffset += 6
    previousX = nextX
    previousY = nextY
    previousZ = nextZ
  }
  return writeOffset
}

/** Describes and samples the approved cubic Hermite beam. */
export const buildHermiteEdgePath = (
  input: HermiteEdgePathInput,
): readonly HermiteEdgePoint[] =>
  sampleHermiteEdgeCurve(describeHermiteEdgeCurve(input))
