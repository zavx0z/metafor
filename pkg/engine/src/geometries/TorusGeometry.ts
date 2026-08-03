import { BufferAttribute, BufferGeometry } from "../core/BufferGeometry"

type CircularAngles = Readonly<{
  cos: Float64Array
  sin: Float64Array
}>

const circularAnglesBySegments = new Map<number, CircularAngles>()

const circularAngles = (segments: number): CircularAngles => {
  const held = circularAnglesBySegments.get(segments)
  if (held) return held
  const cos = new Float64Array(segments + 1)
  const sin = new Float64Array(segments + 1)
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2
    cos[index] = Math.cos(angle)
    sin[index] = Math.sin(angle)
  }
  const created = {cos, sin}
  circularAnglesBySegments.set(segments, created)
  return created
}

/**
 * Параметры для создания геометрии тора.
 */
export interface TorusGeometryParameters {
  radius?: number
  tube?: number
  radialSegments?: number
  tubularSegments?: number
}

/**
 * Класс для создания геометрии тора.
 * @see https://threejs.org/docs/#api/en/geometries/TorusGeometry
 */
export class TorusGeometry extends BufferGeometry {
  public readonly radialSegments: number
  public readonly tubularSegments: number

  /**
   * @param parameters - Параметры для создания геометрии тора.
   * @param parameters.radius - Радиус тора от центра до центра "трубы". **Ограничение:** > 0.
   * @default 0.5
   * @param parameters.tube - Радиус "трубы". **Ограничение:** > 0.
   * @default 0.2
   * @param parameters.radialSegments - Количество сегментов по основной окружности тора. **Ограничение:** >= 3.
   * @default 12
   * @param parameters.tubularSegments - Количество сегментов "трубы". **Ограничение:** >= 3.
   * @default 12
   */
  constructor(parameters: TorusGeometryParameters = {}) {
    super()

    const { radius = 0.5, tube = 0.2, radialSegments = 12, tubularSegments = 12 } = parameters

    this.radialSegments = radialSegments
    this.tubularSegments = tubularSegments

    const vertexCount = (radialSegments + 1) * (tubularSegments + 1)
    const vertices = new Float32Array(vertexCount * 3)
    const normals = new Float32Array(vertexCount * 3)
    const indices = new Uint16Array(radialSegments * tubularSegments * 6)
    const radialAngles = circularAngles(radialSegments)
    const tubularAngles = circularAngles(tubularSegments)
    let vertexOffset = 0

    for (let j = 0; j <= radialSegments; j++) {
      const cosV = radialAngles.cos[j]!
      const sinV = radialAngles.sin[j]!
      for (let i = 0; i <= tubularSegments; i++) {
        const cosU = tubularAngles.cos[i]!
        const sinU = tubularAngles.sin[i]!

        const x = (radius + tube * cosV) * cosU
        const y = (radius + tube * cosV) * sinU
        const z = tube * sinV

        vertices[vertexOffset] = x
        vertices[vertexOffset + 1] = y
        vertices[vertexOffset + 2] = z
        normals[vertexOffset] = cosV * cosU
        normals[vertexOffset + 1] = cosV * sinU
        normals[vertexOffset + 2] = sinV
        vertexOffset += 3
      }
    }

    let indexOffset = 0
    for (let j = 1; j <= radialSegments; j++) {
      for (let i = 1; i <= tubularSegments; i++) {
        const a = (tubularSegments + 1) * j + i - 1
        const b = (tubularSegments + 1) * (j - 1) + i - 1
        const c = (tubularSegments + 1) * (j - 1) + i
        const d = (tubularSegments + 1) * j + i

        indices[indexOffset] = a
        indices[indexOffset + 1] = b
        indices[indexOffset + 2] = d
        indices[indexOffset + 3] = b
        indices[indexOffset + 4] = c
        indices[indexOffset + 5] = d
        indexOffset += 6
      }
    }

    this.setIndex(new BufferAttribute(indices, 1))
    this.setAttribute("position", new BufferAttribute(vertices, 3))
    this.setAttribute("normal", new BufferAttribute(normals, 3))
  }

  public override toWireframe(): BufferGeometry {
    const positions = this.attributes.position!.array!
    const radialSegments = this.radialSegments
    const tubularSegments = this.tubularSegments
    const lines = new Float32Array(radialSegments * tubularSegments * 12)
    let offset = 0

    const getIndex = (j: number, i: number) => (j * (tubularSegments + 1) + i) * 3

    for (let j = 0; j < radialSegments; j++) {
      for (let i = 0; i < tubularSegments; i++) {
        const a = getIndex(j, i)
        const b = getIndex(j, i + 1)
        const c = getIndex(j + 1, i)

        // Both parameter grids close through their duplicated 2π endpoint.
        // Iterating only the unique 0..<segments cells avoids drawing each
        // seam twice as an artificially bright ring.
        lines[offset] = positions[a]!
        lines[offset + 1] = positions[a + 1]!
        lines[offset + 2] = positions[a + 2]!
        lines[offset + 3] = positions[b]!
        lines[offset + 4] = positions[b + 1]!
        lines[offset + 5] = positions[b + 2]!
        lines[offset + 6] = positions[a]!
        lines[offset + 7] = positions[a + 1]!
        lines[offset + 8] = positions[a + 2]!
        lines[offset + 9] = positions[c]!
        lines[offset + 10] = positions[c + 1]!
        lines[offset + 11] = positions[c + 2]!
        offset += 12
      }
    }

    const wireframeGeometry = new BufferGeometry()
    wireframeGeometry.setAttribute("position", new BufferAttribute(lines, 3))
    return wireframeGeometry
  }
}
