import { LineSegments } from "../objects/LineSegments"
import { LineBasicMaterial } from "../materials/LineBasicMaterial"
import { BufferAttribute } from "../core/BufferAttribute"
import { BufferGeometry } from "../core/BufferGeometry"
import { Color } from "../math/Color"

/**
 * Генерирует процедурную сетку, похожую на сетку в Blender.
 */
export class GridHelper extends LineSegments {
  /**
   * @param size - Размер сетки по осям X и Y.
   * @param divisions - Количество делений сетки.
   * @param colorCenterLine - Цвет центральной линии (Hex).
   * @param colorGrid - Цвет основных линий сетки (Hex).
   */
  constructor(size = 10, divisions = 10, colorCenterLine: number = 0x444444, colorGrid: number = 0x888888) {
    const center = divisions / 2
    const step = size / divisions
    const halfSize = size / 2

    const vertices: number[] = []
    const colors: number[] = []

    const color1 = new Color(colorCenterLine)
    const color2 = new Color(colorGrid)

    for (let i = 0; i <= divisions; i++) {
      const isCenter = i === center
      const color = isCenter ? color1 : color2

      // Линии, параллельные оси Y (XY плоскость, Z=0)
      vertices.push(i * step - halfSize, -halfSize, 0, i * step - halfSize, halfSize, 0)
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b)

      // Линии, параллельные оси X (XY плоскость, Z=0)
      vertices.push(-halfSize, i * step - halfSize, 0, halfSize, i * step - halfSize, 0)
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3))
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3))

    const material = new LineBasicMaterial({ 
      vertexColors: true,
      opacity: 0.6 // Прозрачность для создания эффекта затухания
    })

    super(geometry, material)
  }
}
