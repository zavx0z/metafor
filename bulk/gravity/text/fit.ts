import type { TextExtents } from "./extents"

/**
 * Максимально допустимые дуги, которые текст занимает на поверхности.
 *
 * Три независимых ограничения в радианах:
 * - `horizontalRad` — максимальная дуга ширины вдоль базовой параллели (обычно ≈ π × 0.8)
 * - `ascenderRad` — дуга над baseline (ascender-сторона; выше, т.к. буквы вроде `f`/`h` длиннее)
 * - `descenderRad` — дуга под baseline (descender-сторона; короче, т.к. descender-ы компактнее)
 *
 * Несимметрия между ascender/descender предусмотрена: на поверхности тубы тора дальние от экватора
 * точки уходят на обратную сторону силуэта при превышении ~π/2, и descender критичнее зажат.
 */
export interface SurfaceArcLimits {
  horizontalRad: number
  ascenderRad: number
  descenderRad: number
}

/**
 * Радиусы двух окружностей, по которым текст ложится на поверхность.
 *
 * - `baseCurveRadiusMm` — радиус параллели в точке посадки (вдоль которой идёт ширина)
 * - `minorCurveRadiusMm` — радиус в вертикальном направлении (у тора — minorRadius, у сферы — тот же sphereR)
 */
export interface SurfaceCurveRadii {
  baseCurveRadiusMm: number
  minorCurveRadiusMm: number
}

export interface ResolveSurfaceFitScaleOptions {
  curve: SurfaceCurveRadii
  extents: TextExtents
  limits: SurfaceArcLimits
  /** Нижняя граница масштаба — текст не масштабируется ниже неё (вместо полного сжатия в точку). */
  minScale: number
}

/**
 * Единый масштаб посадки текста на поверхность, учитывающий три независимых лимита.
 *
 * Берётся **минимум** из трёх ограничений:
 * - width_fit = (baseCurveR × horizontalRad) / widthMm
 * - ascender_fit = (minorCurveR × ascenderRad) / ascenderMm
 * - descender_fit = (minorCurveR × descenderRad) / descenderMm
 *
 * Равномерный масштаб сохраняет пропорции глифов, но гарантирует, что ни одна ось не превышает
 * отведённую арку. Если `widthMm`/`ascenderMm`/`descenderMm` = 0, соответствующий лимит игнорируется.
 */
export const resolveSurfaceFitScale = ({
  curve,
  extents,
  limits,
  minScale,
}: ResolveSurfaceFitScaleOptions): number => {
  const safeBase = Math.max(Math.abs(curve.baseCurveRadiusMm), 1e-3)
  const safeMinor = Math.max(Math.abs(curve.minorCurveRadiusMm), 1e-3)

  const widthFit = extents.widthMm > 0 ? (safeBase * limits.horizontalRad) / extents.widthMm : 1
  const ascenderFit =
    extents.ascenderMm > 0 ? (safeMinor * limits.ascenderRad) / extents.ascenderMm : 1
  const descenderFit =
    extents.descenderMm > 0 ? (safeMinor * limits.descenderRad) / extents.descenderMm : 1

  return Math.max(minScale, Math.min(1, widthFit, ascenderFit, descenderFit))
}
