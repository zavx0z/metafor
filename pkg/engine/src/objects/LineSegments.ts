import { BufferGeometry } from "../core/BufferGeometry"
import { Material } from "../materials/Material"
import { Object3D } from "../core/Object3D"

/**
 * Объект для отрисовки геометрии в виде набора линий.
 */
export class LineSegments extends Object3D {
  public geometry: BufferGeometry
  public material: Material

  constructor(geometry: BufferGeometry, material: Material) {
    super()
    this.geometry = geometry
    this.material = material
  }
}
