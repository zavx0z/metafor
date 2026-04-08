import { Color } from "../math/Color"
import { Material, MaterialParameters } from "./Material"

/**
 * Параметры для создания {@link LineBasicMaterial}.
 */
export interface LineBasicMaterialParameters extends MaterialParameters {
  /**
   * Цвет линии в формате RGB.
   * @default 0xffffff
   */
  color?: number | Color
  /**
   * Прозрачность материала (0.0 - полностью прозрачный, 1.0 - полностью непрозрачный).
   * @default 1.0
   */
  opacity?: number
}

/**
 * Базовый материал для отрисовки линий.
 */
export class LineBasicMaterial extends Material {
  /** @default new Color(0xffffff) */
  public color: Color
  /** @default 1.0 */
  public opacity: number

  /**
   * @param parameters - Параметры материала.
   */
  constructor(parameters: LineBasicMaterialParameters = {}) {
    super(parameters)
    if (parameters.color instanceof Color) {
      this.color = parameters.color.clone()
    } else {
      this.color = new Color(parameters.color ?? 0xffffff)
    }
    this.opacity = parameters.opacity ?? 1.0
  }
}
