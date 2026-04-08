import { Color } from "../math/Color"
import { Material, MaterialParameters } from "./Material"

/**
 * Параметры для создания {@link TextMaterial}.
 */
export interface TextMaterialParameters extends MaterialParameters {
  /**
   * Цвет текста.
   * @default 0xffffff
   */
  color?: number | Color
}

/**
 * Материал для отрисовки текста.
 */
export class TextMaterial extends Material {
  public readonly isTextMaterial: true = true
  /** @default new Color(0xffffff) */
  public color: Color

  /**
   * @param parameters - Параметры материала.
   */
  constructor(parameters: TextMaterialParameters = {}) {
    super(parameters)
    this.color = new Color(parameters.color ?? 0xffffff)
  }
}
