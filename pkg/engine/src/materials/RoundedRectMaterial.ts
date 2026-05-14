import { Color } from "../math"
import { Material, type MaterialParameters } from "./Material"

/**
 * Параметры RoundedRectMaterial.
 *
 * Все размеры — в WORLD-units (тех же что у PlaneGeometry, к которому
 * привязан меш). Caller сам пересчитывает logical-px → world через свой
 * pixelScale (например `cw * pixelScale` в Card.drawRect).
 *
 * `radius` — единое значение либо per-corner кортеж {tl, tr, br, bl}.
 * `borderWidth` = 0 даёт чистую заливку без рамки.
 *
 * Антиалиасинг работает через fwidth() в фрагментном шейдере — независим
 * от размера меша и pixelRatio, даёт стабильный 1-px переход на любой DPR.
 */
export interface RoundedRectMaterialParameters extends MaterialParameters {
  /** Полный размер прямоугольника в world-units (width, height меша). */
  width: number
  height: number
  /** Радиус скругления (world-units). Может быть single number или per-corner. */
  radius: number | {tl: number; tr: number; br: number; bl: number}
  /** Цвет заливки. Default 0xffffff. */
  fill?: Color | number | null
  /** Цвет рамки. Default null (нет рамки). */
  border?: Color | number | null
  /** Толщина рамки в world-units. Default 0. */
  borderWidth?: number
  /** 0..1, домножается на alpha. Default 1. */
  opacity?: number
}

export class RoundedRectMaterial extends Material {
  public readonly isRoundedRectMaterial: true = true

  public width: number
  public height: number
  /** tl, tr, br, bl */
  public radii: [number, number, number, number]
  public fill: Color
  public border: Color
  public borderWidth: number
  public opacity: number
  public clipBounds: [number, number, number, number] | null = null

  constructor(parameters: RoundedRectMaterialParameters) {
    super(parameters)
    this.width = parameters.width
    this.height = parameters.height

    if (typeof parameters.radius === "number") {
      const r = parameters.radius
      this.radii = [r, r, r, r]
    } else {
      const {tl, tr, br, bl} = parameters.radius
      this.radii = [tl, tr, br, bl]
    }

    this.fill = parameters.fill instanceof Color
      ? parameters.fill.clone()
      : new Color(parameters.fill === null || parameters.fill === undefined ? 0xffffff : parameters.fill)
    this.border = parameters.border instanceof Color
      ? parameters.border.clone()
      : new Color(parameters.border === null || parameters.border === undefined ? 0x000000 : parameters.border)
    if (parameters.border === null || parameters.border === undefined) {
      this.border.a = 0
    }

    this.borderWidth = Math.max(0, parameters.borderWidth ?? 0)
    this.opacity = parameters.opacity ?? 1
  }
}
