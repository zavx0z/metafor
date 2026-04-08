import { Light } from "./Light"
import { Object3D } from "../core/Object3D"
import { Color } from "../math/Color"

/**
 * Направленный источник света.
 *
 * Этот источник света ведет себя так, как будто он находится бесконечно далеко,
 * и все лучи от него параллельны.
 * Распространенный вариант использования — имитация солнечного света.
 */
export class DirectionalLight extends Light {
  /** @default new Object3D() */
  public target: Object3D

  /**
   * @param color - Цвет источника света.
   * @param intensity - Интенсивность света.
   */
  constructor(color: number | Color, intensity: number) {
    super(color, intensity)

    this.target = new Object3D()
    // По умолчанию свет направлен из (0, 0, 1) в (0, 0, 0)
    this.position.set(0, 0, 1)
  }
}
