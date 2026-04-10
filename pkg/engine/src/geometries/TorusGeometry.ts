import { BufferAttribute, BufferGeometry } from "../core/BufferGeometry"

/**
 * Параметры для создания геометрии тора.
 */
interface TorusGeometryParameters {
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

    const vertices: number[] = []
    const indices: number[] = []

    for (let j = 0; j <= radialSegments; j++) {
      for (let i = 0; i <= tubularSegments; i++) {
        const u = (i / tubularSegments) * Math.PI * 2
        const v = (j / radialSegments) * Math.PI * 2

        const x = (radius + tube * Math.cos(v)) * Math.cos(u)
        const y = (radius + tube * Math.cos(v)) * Math.sin(u)
        const z = tube * Math.sin(v)

        vertices.push(x, y, z)
      }
    }

    for (let j = 1; j <= radialSegments; j++) {
      for (let i = 1; i <= tubularSegments; i++) {
        const a = (tubularSegments + 1) * j + i - 1
        const b = (tubularSegments + 1) * (j - 1) + i - 1
        const c = (tubularSegments + 1) * (j - 1) + i
        const d = (tubularSegments + 1) * j + i

        indices.push(a, b, d)
        indices.push(b, c, d)
      }
    }

    this.setIndex(new BufferAttribute(new Uint16Array(indices), 1))
    this.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3))
  }

  public override toWireframe(): BufferGeometry {
    const positions = this.attributes.position.array
    const radialSegments = this.radialSegments
    const tubularSegments = this.tubularSegments
    const lines: number[] = []

    const getIndex = (j: number, i: number) => (j * (tubularSegments + 1) + i) * 3

    for (let j = 0; j <= radialSegments; j++) {
      for (let i = 0; i <= tubularSegments; i++) {
        const a = getIndex(j, i)

        // Tubular line (around the tube)
        if (i < tubularSegments) {
          const b = getIndex(j, i + 1)
          lines.push(positions[a], positions[a + 1], positions[a + 2])
          lines.push(positions[b], positions[b + 1], positions[b + 2])
        }

        // Radial line (around the torus)
        if (j < radialSegments) {
          const c = getIndex(j + 1, i)
          lines.push(positions[a], positions[a + 1], positions[a + 2])
          lines.push(positions[c], positions[c + 1], positions[c + 2])
        }
      }
    }

    const wireframeGeometry = new BufferGeometry()
    wireframeGeometry.setAttribute("position", new BufferAttribute(new Float32Array(lines), 3))
    return wireframeGeometry
  }
}
