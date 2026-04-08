import { BufferAttribute, BufferGeometry } from "../core/BufferGeometry"

interface PlaneGeometryParameters {
  width?: number
  height?: number
  widthSegments?: number
  heightSegments?: number
}

export class PlaneGeometry extends BufferGeometry {
  constructor(parameters: PlaneGeometryParameters = {}) {
    super()
    const {
      width = 1,
      height = 1,
      widthSegments = 1,
      heightSegments = 1
    } = parameters

    const widthHalf = width / 2
    const heightHalf = height / 2
    const gridX = Math.floor(widthSegments)
    const gridY = Math.floor(heightSegments)
    const gridX1 = gridX + 1
    const gridY1 = gridY + 1
    const segmentWidth = width / gridX
    const segmentHeight = height / gridY

    const vertices: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const indices: number[] = []

    // Вершины, нормали и UV
    for (let iy = 0; iy < gridY1; iy++) {
      const y = iy * segmentHeight - heightHalf
      for (let ix = 0; ix < gridX1; ix++) {
        const x = ix * segmentWidth - widthHalf
        vertices.push(x, -y, 0)
        normals.push(0, 0, 1)
        uvs.push(ix / gridX)
        uvs.push(1 - (iy / gridY))
      }
    }

    // Индексы
    for (let iy = 0; iy < gridY; iy++) {
      for (let ix = 0; ix < gridX; ix++) {
        const a = ix + gridX1 * iy
        const b = ix + gridX1 * (iy + 1)
        const c = (ix + 1) + gridX1 * (iy + 1)
        const d = (ix + 1) + gridX1 * iy
        indices.push(a, b, d)
        indices.push(b, c, d)
      }
    }

    this.setIndex(new BufferAttribute(new Uint16Array(indices), 1))
    this.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3))
    this.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3))
    this.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2))
  }
}
