import type { ResolveSurfaceFitScaleOptions } from "@bulk/types/text"

/**
 * Максимальная доля параллели, которую текст занимает по горизонтали (в радианах).
 *
 * Вертикального лимита больше нет: деформация идёт только по экватору (см. `projection.ts`),
 * а по меридиану текст остаётся плоским, поэтому ascender/descender физически не могут
 * зайти за силуэт поверхности.
 */
/**
 * Единый масштаб посадки текста по ширине.
 *
 * Для экваторной деформации достаточно одного ограничения — `curveRadiusMm × horizontalRad / widthMm`:
 * текст не должен занимать больше отведённой дуги параллели. Вертикальные лимиты не нужны,
 * потому что по меридиану текст не деформируется.
 */
export const resolveSurfaceFitScale = ({
  curveRadiusMm,
  extents,
  limits,
  minScale,
}: ResolveSurfaceFitScaleOptions): number => {
  if (!(extents.widthMm > 0)) return 1
  const safeCurve = Math.max(Math.abs(curveRadiusMm), 1e-3)
  const widthFit = (safeCurve * limits.horizontalRad) / extents.widthMm
  return Math.max(minScale, Math.min(1, widthFit))
}
