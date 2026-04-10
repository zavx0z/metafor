import { Color } from "../math"
import { Material, type MaterialParameters } from "./Material"

/**
 * Параметры для создания {@link TextMaterial}.
 */
export interface TextMaterialParameters extends MaterialParameters {
  /**
   * Цвет текста.
   * @default 0xffffff
   */
  color?: number | Color
  /**
   * Прозрачность текста.
   * @default 1.0
   */
  opacity?: number
}

/**
 * Материал для отрисовки текста.
 */
export class TextMaterial extends Material {
  public readonly isTextMaterial: true = true
  /** @default new Color(0xffffff) */
  public color: Color
  /** @default 1.0 */
  public opacity: number

  /**
   * @param parameters - Параметры материала.
   */
  constructor(parameters: TextMaterialParameters = {}) {
    super(parameters)
    this.color = new Color(parameters.color ?? 0xffffff)
    this.opacity = parameters.opacity ?? 1.0
  }
}
