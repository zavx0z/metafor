import { BufferAttribute, BufferGeometry } from "../core/BufferGeometry"
import { Vector3 } from "../math"

type AngleTable = Readonly<{
  cos: Float64Array
  sin: Float64Array
}>

const angleTableCache = new Map<string, AngleTable>()

const angleTable = (
  segments: number,
  length: number,
): AngleTable => {
  const key = `${segments}:${length}`
  const held = angleTableCache.get(key)
  if (held) return held
  const cos = new Float64Array(segments + 1)
  const sin = new Float64Array(segments + 1)
  for (let index = 0; index <= segments; index += 1) {
    const angle = index / segments * length
    cos[index] = Math.cos(angle)
    sin[index] = Math.sin(angle)
  }
  const created = {cos, sin}
  angleTableCache.set(key, created)
  return created
}

interface SphereGeometryParameters {
  radius?: number
  widthSegments?: number
  heightSegments?: number
}

export class SphereGeometry extends BufferGeometry {
  public readonly widthSegments: number
  public readonly heightSegments: number

  constructor(parameters: SphereGeometryParameters = {}) {
    super()
    const {
      radius = 1,
      widthSegments = 8,
      heightSegments = 6
    } = parameters

    const thetaEnd = Math.PI
    const thetaStart = 0
    const phiStart = 0
    const phiLength = Math.PI * 2

    const widthSegs = Math.max(3, Math.floor(widthSegments))
    const heightSegs = Math.max(2, Math.floor(heightSegments))

    this.widthSegments = widthSegs
    this.heightSegments = heightSegs

    const vertexCount = (widthSegs + 1) * (heightSegs + 1)
    const vertices = new Float32Array(vertexCount * 3)
    const normals = new Float32Array(vertexCount * 3)
    const uvs = new Float32Array(vertexCount * 2)
    const indices = new Uint16Array(widthSegs * (heightSegs - 1) * 6)

    const vertex = new Vector3()
    const normal = new Vector3()
    const phi = angleTable(widthSegs, phiLength)
    const theta = angleTable(heightSegs, thetaEnd)

    let vertexOffset = 0
    let uvOffset = 0

    // Генерация вершин, нормалей и UV
    for (let iy = 0; iy <= heightSegs; iy++) {
      const v = iy / heightSegs
      const sinTheta = theta.sin[iy]!
      const cosTheta = theta.cos[iy]!
      const uOffset = (iy === 0) ? 0.5 / widthSegs : (iy === heightSegs) ? -0.5 / widthSegs : 0

      for (let ix = 0; ix <= widthSegs; ix++) {
        const u = ix / widthSegs
        vertex.x = -radius * phi.cos[ix]! * sinTheta
        vertex.y = radius * cosTheta
        vertex.z = radius * phi.sin[ix]! * sinTheta
        vertices[vertexOffset] = vertex.x
        vertices[vertexOffset + 1] = vertex.y
        vertices[vertexOffset + 2] = vertex.z
        normal.copy(vertex).normalize()
        normals[vertexOffset] = normal.x
        normals[vertexOffset + 1] = normal.y
        normals[vertexOffset + 2] = normal.z
        uvs[uvOffset] = u + uOffset
        uvs[uvOffset + 1] = 1 - v
        vertexOffset += 3
        uvOffset += 2
      }
    }

    // Генерация индексов
    let indexOffset = 0
    for (let iy = 0; iy < heightSegs; iy++) {
      for (let ix = 0; ix < widthSegs; ix++) {
        const a = iy * (widthSegs + 1) + ix + 1
        const b = iy * (widthSegs + 1) + ix
        const c = (iy + 1) * (widthSegs + 1) + ix
        const d = (iy + 1) * (widthSegs + 1) + ix + 1
        if (iy !== 0) {
          indices[indexOffset] = a
          indices[indexOffset + 1] = b
          indices[indexOffset + 2] = d
          indexOffset += 3
        }
        if (iy !== heightSegs - 1) {
          indices[indexOffset] = b
          indices[indexOffset + 1] = c
          indices[indexOffset + 2] = d
          indexOffset += 3
        }
      }
    }

    this.setIndex(new BufferAttribute(indices, 1))
    this.setAttribute("position", new BufferAttribute(vertices, 3))
    this.setAttribute("normal", new BufferAttribute(normals, 3))
    this.setAttribute("uv", new BufferAttribute(uvs, 2))
  }

  public override toWireframe(): BufferGeometry {
    const positions = this.attributes.position!.array!
    const widthSegs = this.widthSegments
    const heightSegs = this.heightSegments
    const segmentCount = (heightSegs + 1) * widthSegs + heightSegs * (widthSegs + 1)
    const lines = new Float32Array(segmentCount * 6)
    let offset = 0

    const getIndex = (iy: number, ix: number) => (iy * (widthSegs + 1) + ix) * 3

    for (let iy = 0; iy <= heightSegs; iy++) {
      for (let ix = 0; ix <= widthSegs; ix++) {
        const a = getIndex(iy, ix)

        // Horizontal line
        if (ix < widthSegs) {
          const b = getIndex(iy, ix + 1)
          lines[offset] = positions[a]!
          lines[offset + 1] = positions[a + 1]!
          lines[offset + 2] = positions[a + 2]!
          lines[offset + 3] = positions[b]!
          lines[offset + 4] = positions[b + 1]!
          lines[offset + 5] = positions[b + 2]!
          offset += 6
        }

        // Vertical line
        if (iy < heightSegs) {
          const c = getIndex(iy + 1, ix)
          lines[offset] = positions[a]!
          lines[offset + 1] = positions[a + 1]!
          lines[offset + 2] = positions[a + 2]!
          lines[offset + 3] = positions[c]!
          lines[offset + 4] = positions[c + 1]!
          lines[offset + 5] = positions[c + 2]!
          offset += 6
        }
      }
    }

    const wireframeGeometry = new BufferGeometry()
    wireframeGeometry.setAttribute("position", new BufferAttribute(lines, 3))
    return wireframeGeometry
  }
}
