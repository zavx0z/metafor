import { Color } from "../math/Color"
import { Material, MaterialParameters } from "./Material"

/**
 * Параметры для создания {@link MeshBasicMaterial}.
 */
export interface MeshBasicMaterialParameters extends MaterialParameters {
  /**
   * Цвет материала.
   * @default 0xffffff (белый)
   */
  color?: number | Color
}

/**
 * Простой материал, который отображает объекты сплошным цветом.
 */
export class MeshBasicMaterial extends Material {
  public color: Color

  /**
   * @param parameters - Параметры для материала.
   */
  constructor(parameters: MeshBasicMaterialParameters = {}) {
    super(parameters)

    if (parameters.color instanceof Color) {
      this.color = parameters.color.clone()
    } else {
      this.color = new Color(parameters.color)
    }
  }
}
