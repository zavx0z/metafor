import { Color } from "../math"
import { Material, type MaterialParameters } from "./Material"

/**
 * Параметры RoundedRectMaterial.
 *
 * Все размеры — в WORLD-units. Caller сам пересчитывает logical-px → world
 * через свой pixelScale. Для обычного rounded rect `width`/`height` совпадают
 * с PlaneGeometry; analytical shadow сохраняет в них исходную inner shape,
 * а сам quad симметрично расширяется на `shadowSpread + shadowBlur`.
 *
 * `radius` — единое значение либо per-corner кортеж {tl, tr, br, bl}.
 * `borderWidth` = 0 даёт чистую заливку без рамки.
 *
 * Антиалиасинг работает через fwidth() в фрагментном шейдере — независим
 * от размера меша и pixelRatio, даёт стабильный 1-px переход на любой DPR.
 */
export interface RoundedRectMaterialParameters extends MaterialParameters {
  /** Размер исходной SDF-формы в world-units. */
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
  /** Local half-width of the analytical shadow fade. Default 0. */
  shadowBlur?: number
  /** Local solid expansion before the analytical shadow fade. Default 0. */
  shadowSpread?: number
}

const finiteNonNegative = (value: number | undefined): number =>
  value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0

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
  public shadowBlur: number
  public shadowSpread: number
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
    this.shadowBlur = finiteNonNegative(parameters.shadowBlur)
    this.shadowSpread = finiteNonNegative(parameters.shadowSpread)
  }
}
