import { BufferAttribute, BufferGeometry } from "../core/BufferGeometry"
import { Vector3 } from "../math"

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

    const vertices: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const indices: number[] = []

    const vertex = new Vector3()
    const normal = new Vector3()

    let index = 0
    const grid: number[][] = []

    // Генерация вершин, нормалей и UV
    for (let iy = 0; iy <= heightSegs; iy++) {
      const v = iy / heightSegs
      const row: number[] = []
      const uOffset = (iy === 0) ? 0.5 / widthSegs : (iy === heightSegs) ? -0.5 / widthSegs : 0

      for (let ix = 0; ix <= widthSegs; ix++) {
        const u = ix / widthSegs
        vertex.x = -radius * Math.cos(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaEnd)
        vertex.y = radius * Math.cos(thetaStart + v * thetaEnd)
        vertex.z = radius * Math.sin(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaEnd)
        vertices.push(vertex.x, vertex.y, vertex.z)
        normal.copy(vertex).normalize()
        normals.push(normal.x, normal.y, normal.z)
        uvs.push(u + uOffset, 1 - v)
        row.push(index++)
      }
      grid.push(row)
    }

    // Генерация индексов
    for (let iy = 0; iy < heightSegs; iy++) {
      for (let ix = 0; ix < widthSegs; ix++) {
        const a = grid[iy]![ix + 1]!
        const b = grid[iy]![ix]!
        const c = grid[iy + 1]![ix]!
        const d = grid[iy + 1]![ix + 1]!
        if (iy !== 0) {
          indices.push(a, b, d)
        }
        if (iy !== heightSegs - 1) {
          indices.push(b, c, d)
        }
      }
    }

    this.setIndex(new BufferAttribute(new Uint16Array(indices), 1))
    this.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3))
    this.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3))
    this.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2))
  }

  public override toWireframe(): BufferGeometry {
    const positions = this.attributes.position!.array!
    const widthSegs = this.widthSegments
    const heightSegs = this.heightSegments
    const lines: number[] = []

    const getIndex = (iy: number, ix: number) => (iy * (widthSegs + 1) + ix) * 3

    for (let iy = 0; iy <= heightSegs; iy++) {
      for (let ix = 0; ix <= widthSegs; ix++) {
        const a = getIndex(iy, ix)

        // Horizontal line
        if (ix < widthSegs) {
          const b = getIndex(iy, ix + 1)
          lines.push(positions[a]!, positions[a + 1]!, positions[a + 2]!)
          lines.push(positions[b]!, positions[b + 1]!, positions[b + 2]!)
        }

        // Vertical line
        if (iy < heightSegs) {
          const c = getIndex(iy + 1, ix)
          lines.push(positions[a]!, positions[a + 1]!, positions[a + 2]!)
          lines.push(positions[c]!, positions[c + 1]!, positions[c + 2]!)
        }
      }
    }

    const wireframeGeometry = new BufferGeometry()
    wireframeGeometry.setAttribute("position", new BufferAttribute(new Float32Array(lines), 3))
    return wireframeGeometry
  }
}
