import { BufferAttribute, BufferGeometry } from "../core/BufferGeometry"
import { Vector3 } from "../math/Vector3"

interface BoxGeometryParameters {
  width?: number
  height?: number
  depth?: number
  widthSegments?: number
  heightSegments?: number
  depthSegments?: number
}

export class BoxGeometry extends BufferGeometry {
  constructor(parameters: BoxGeometryParameters = {}) {
    super()
    const {
      width = 1,
      height = 1,
      depth = 1,
      widthSegments = 1,
      heightSegments = 1,
      depthSegments = 1
    } = parameters

    const widthHalf = width / 2
    const heightHalf = height / 2
    const depthHalf = depth / 2

    const gridX = Math.floor(widthSegments)
    const gridY = Math.floor(heightSegments)
    const gridZ = Math.floor(depthSegments)

    const segmentWidth = width / gridX
    const segmentHeight = height / gridY
    const segmentDepth = depth / gridZ

    const vertices: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const indices: number[] = []

    let vertexCounter = 0

    // Функция для добавления грани
    const buildPlane = (
      u: number, v: number, w: number,
      udir: number, vdir: number,
      width: number, height: number, depth: number,
      gridX: number, gridY: number,
      materialIndex: number
    ) => {
      const segmentWidth = width / gridX
      const segmentHeight = height / gridY

      const widthHalf = width / 2
      const heightHalf = height / 2
      const depthHalf = depth / 2

      const vector = new Vector3()

      for (let iy = 0; iy <= gridY; iy++) {
        const y = iy * segmentHeight - heightHalf
        for (let ix = 0; ix <= gridX; ix++) {
          const x = ix * segmentWidth - widthHalf

          vector.set(u, v, w)
          vector.multiplyScalar(depthHalf)
          vector.addScaledVector(new Vector3(1, 0, 0), x * udir)
          vector.addScaledVector(new Vector3(0, 1, 0), y * vdir)

          vertices.push(vector.x, vector.y, vector.z)

          const normal = new Vector3(u, v, w)
          normals.push(normal.x, normal.y, normal.z)

          uvs.push(ix / gridX)
          uvs.push(1 - (iy / gridY))
        }
      }

      for (let iy = 0; iy < gridY; iy++) {
        for (let ix = 0; ix < gridX; ix++) {
          const a = vertexCounter + ix + (gridX + 1) * iy
          const b = vertexCounter + ix + (gridX + 1) * (iy + 1)
          const c = vertexCounter + (ix + 1) + (gridX + 1) * (iy + 1)
          const d = vertexCounter + (ix + 1) + (gridX + 1) * iy

          indices.push(a, b, d)
          indices.push(b, c, d)
        }
      }

      vertexCounter += (gridX + 1) * (gridY + 1)
    }

    // +X грань
    buildPlane(1, 0, 0, 1, 1, depth, height, width, gridZ, gridY, 0)
    // -X грань
    buildPlane(-1, 0, 0, -1, 1, depth, height, -width, gridZ, gridY, 1)
    // +Y грань
    buildPlane(0, 1, 0, 1, -1, width, depth, height, gridX, gridZ, 2)
    // -Y грань
    buildPlane(0, -1, 0, 1, 1, width, depth, -height, gridX, gridZ, 3)
    // +Z грань
    buildPlane(0, 0, 1, 1, 1, width, height, depth, gridX, gridY, 4)
    // -Z грань
    buildPlane(0, 0, -1, -1, 1, width, height, -depth, gridX, gridY, 5)

    this.setIndex(new BufferAttribute(new Uint16Array(indices), 1))
    this.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3))
    this.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3))
    this.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2))
  }
}
