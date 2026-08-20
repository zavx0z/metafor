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
  /**
   * Записывать глубину в cover-pass текста.
   *
   * По умолчанию текст только проверяет depth buffer и подходит для UI/оверлеев.
   * Для 3D-подписей на поверхности включайте `depthWrite`, чтобы следующие
   * текстовые объекты отсекались depth buffer'ом корректно.
   * @default false
   */
  depthWrite?: boolean
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
  /** @default false */
  public depthWrite: boolean

  /**
   * @param parameters - Параметры материала.
   */
  constructor(parameters: TextMaterialParameters = {}) {
    super(parameters)
    const color = parameters.color ?? 0xffffff
    this.color = color instanceof Color
      ? new Color(color.r, color.g, color.b, color.a)
      : new Color(color)
    this.opacity = parameters.opacity ?? 1.0
    this.depthWrite = parameters.depthWrite ?? false
  }
}
