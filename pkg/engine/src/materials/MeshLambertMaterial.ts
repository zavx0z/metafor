import { Color } from "../math/Color"
import { Material, MaterialParameters } from "./Material"

/**
 * Параметры для создания {@link MeshLambertMaterial}.
 */
export interface MeshLambertMaterialParameters extends MaterialParameters {
  /**
   * Цвет материала.
   * @default new Color(0xffffff) // белый
   */
  color?: number | Color
}

/**
 * Материал для диффузного освещения, который реагирует на источники света.
 * Отражает свет равномерно во всех направлениях.
 */
export class MeshLambertMaterial extends Material {
  /** @default new Color(0xffffff) // белый */
  public color: Color

  /**
   * @param parameters - Параметры материала.
   */
  constructor(parameters: MeshLambertMaterialParameters = {}) {
    super(parameters)

    this.color = new Color(parameters.color ?? 0xffffff)
  }
}
