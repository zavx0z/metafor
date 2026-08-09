import {BufferAttribute, BufferGeometry} from "@metafor/engine"

export type UiPolylinePoint = Readonly<{x: number; y: number}>

const STROKE_EPSILON = 1e-6
const STROKE_MITER_LIMIT = 2

/**
 * Builds one indexed triangle ribbon for a thick 2D polyline.
 *
 * Adjacent segments share the same pair of join vertices, so the stroke has
 * no per-segment gaps and renders as one Mesh/draw call. Coordinates and
 * thickness use the caller's units; UiSurface applies its logical-pixel scale
 * to the resulting Mesh.
 */
export const createUiPolylineStrokeGeometry = (
  points: readonly UiPolylinePoint[],
  thickness: number,
): BufferGeometry | null => {
  if (!Number.isFinite(thickness) || thickness <= 0 || points.length < 2) return null

  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
  }

  const strokePoints: UiPolylinePoint[] = []
  for (const point of points) {
    const previous = strokePoints.at(-1)
    if (previous !== undefined && Math.hypot(point.x - previous.x, point.y - previous.y) <= STROKE_EPSILON) {
      continue
    }
    strokePoints.push(point)
  }
  if (strokePoints.length < 2) return null

  const halfWidth = thickness / 2
  const vertexCount = strokePoints.length * 2
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)

  const directions = new Float32Array((strokePoints.length - 1) * 2)
  for (let index = 0; index < strokePoints.length - 1; index += 1) {
    const from = strokePoints[index]!
    const to = strokePoints[index + 1]!
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    const offset = index * 2
    directions[offset] = dx / length
    directions[offset + 1] = dy / length
  }

  for (let index = 0; index < strokePoints.length; index += 1) {
    const point = strokePoints[index]!
    const previousDirectionOffset = Math.max(0, index - 1) * 2
    const nextDirectionOffset = Math.min(strokePoints.length - 2, index) * 2
    const previousNormalX = -directions[previousDirectionOffset + 1]!
    const previousNormalY = directions[previousDirectionOffset]!
    const nextNormalX = -directions[nextDirectionOffset + 1]!
    const nextNormalY = directions[nextDirectionOffset]!

    let offsetX = nextNormalX * halfWidth
    let offsetY = nextNormalY * halfWidth
    if (index > 0 && index < strokePoints.length - 1) {
      const miterX = previousNormalX + nextNormalX
      const miterY = previousNormalY + nextNormalY
      const miterLength = Math.hypot(miterX, miterY)
      if (miterLength > STROKE_EPSILON) {
        const unitMiterX = miterX / miterLength
        const unitMiterY = miterY / miterLength
        const projection = unitMiterX * nextNormalX + unitMiterY * nextNormalY
        if (Math.abs(projection) > STROKE_EPSILON) {
          const scale = Math.min(
            Math.abs(halfWidth / projection),
            halfWidth * STROKE_MITER_LIMIT,
          )
          offsetX = unitMiterX * scale
          offsetY = unitMiterY * scale
        }
      }
    }

    const leftOffset = index * 6
    const rightOffset = leftOffset + 3
    positions[leftOffset] = point.x + offsetX
    positions[leftOffset + 1] = point.y + offsetY
    positions[rightOffset] = point.x - offsetX
    positions[rightOffset + 1] = point.y - offsetY
    normals[leftOffset + 2] = 1
    normals[rightOffset + 2] = 1
  }

  const indexCount = (strokePoints.length - 1) * 6
  const indices = vertexCount <= 0xffff
    ? new Uint16Array(indexCount)
    : new Uint32Array(indexCount)
  for (let segment = 0; segment < strokePoints.length - 1; segment += 1) {
    const vertex = segment * 2
    const offset = segment * 6
    indices[offset] = vertex
    indices[offset + 1] = vertex + 1
    indices[offset + 2] = vertex + 2
    indices[offset + 3] = vertex + 2
    indices[offset + 4] = vertex + 1
    indices[offset + 5] = vertex + 3
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(positions, 3))
  geometry.setAttribute("normal", new BufferAttribute(normals, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}
