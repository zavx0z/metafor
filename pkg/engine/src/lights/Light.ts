import { Object3D } from "../core/Object3D"
import { Color } from "../math/Color"

/**
 * Абстрактный базовый класс для источников света.
 * Участвует в расчете освещенности (PBR).
 */
export class Light extends Object3D {
  /**
   * RGB составляющая. Изменение влияет на сцену мгновенно.
   */
  public color: Color

  /**
   * Энергия источника (в Люменах).
   */
  public intensity: number

  /**
   * @param color - Hex integer (напр. `0xff0000`) или экземпляр Color.
   * @param intensity - Сила света. Ограничение: `>= 0`.
   */
  constructor(color: number | Color = 0xffffff, intensity: number = 1) {
    super()
    this.color = new Color(color)
    this.intensity = intensity
  }
}
