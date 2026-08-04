import {
  BufferAttribute,
  BufferGeometry,
  Color,
} from "@metafor/engine"

export const FIELDS_MATTE_DEFAULT_OPACITY = 0.55
export const FIELDS_MATTE_TEXT_COLOR = 0x000000
export const FIELDS_MATTE_TEXT_OPACITY = 0.92

const writeFlatFieldBandPositions = (
  positions: Float32Array,
  innerRadius: number,
  outerRadius: number,
  segments: number,
): void => {
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const offset = index * 6
    positions[offset] = cosine * innerRadius
    positions[offset + 1] = sine * innerRadius
    positions[offset + 2] = 0
    positions[offset + 3] = cosine * outerRadius
    positions[offset + 4] = sine * outerRadius
    positions[offset + 5] = 0
  }
}

export const createFlatFieldBandGeometry = (
  innerRadius: number,
  outerRadius: number,
  segments = 192,
): BufferGeometry => {
  const safeSegments = Math.max(16, Math.floor(segments))
  const positions = new Float32Array(safeSegments * 2 * 3)
  const normals = new Float32Array(safeSegments * 2 * 3)
  const indices = new Uint16Array(safeSegments * 6)
  writeFlatFieldBandPositions(
    positions,
    innerRadius,
    outerRadius,
    safeSegments,
  )
  for (let index = 0; index < safeSegments; index += 1) {
    const vertexOffset = index * 6
    normals[vertexOffset + 2] = 1
    normals[vertexOffset + 5] = 1
    const next = (index + 1) % safeSegments
    const indexOffset = index * 6
    indices[indexOffset] = index * 2
    indices[indexOffset + 1] = index * 2 + 1
    indices[indexOffset + 2] = next * 2
    indices[indexOffset + 3] = index * 2 + 1
    indices[indexOffset + 4] = next * 2 + 1
    indices[indexOffset + 5] = next * 2
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(positions, 3))
  geometry.setAttribute("normal", new BufferAttribute(normals, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  return geometry
}

export const updateFlatFieldBandGeometry = (
  geometry: BufferGeometry,
  innerRadius: number,
  outerRadius: number,
): void => {
  const position = geometry.attributes.position
  if (!position || !(position.array instanceof Float32Array)) return
  writeFlatFieldBandPositions(
    position.array,
    innerRadius,
    outerRadius,
    position.count / 2,
  )
  position.needsUpdate = true
  geometry.boundingSphere = null
}

export const deriveFieldsMattePastel = (
  color: Color,
  opacity: number,
): Color => new Color(
  color.r + (1 - color.r) * 0.46,
  color.g + (1 - color.g) * 0.46,
  color.b + (1 - color.b) * 0.46,
  Math.min(0.58, Math.max(0.05, opacity * 0.55)),
)
