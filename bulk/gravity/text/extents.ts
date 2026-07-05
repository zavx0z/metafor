import type { FontMetrics, TextExtents } from "@metafor/types/bulk/layout"

/**
 * Типографские размеры одного отрендеренного текста в миллиметрах.
 *
 * Ширина берётся из фактической bbox позиций (полные глифы + letter-spacing).
 * Высоты (ascender над baseline, descender под baseline) — из метрик шрифта, **не** из per-string bbox:
 * это гарантирует стабильный размер меток между строками и корректное место для descender-ов
 * независимо от того, есть ли в строке `y`/`g`/`p`.
 *
 * Baseline по соглашению всегда `y = 0` в координатах Text-геометрии.
 */
/** Находит min/max по X в плоской массиве позиций (stride = 3 координаты на вершину). */
const findXBounds = (positions: Float32Array): { minX: number; maxX: number } | null => {
  if (positions.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0
    if (x < minX) minX = x
    if (x > maxX) maxX = x
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null
  return { minX, maxX }
}

/**
 * Считает {@link TextExtents} из позиций геометрии Text и метрик шрифта.
 *
 * Baseline = 0 по соглашению Text-геометрии.
 * `ascenderMm`/`descenderMm` выводятся из font metrics × (fontSize / unitsPerEm),
 * без зависимости от конкретного набора глифов в строке.
 */
export const resolveTextExtents = (
  positions: Float32Array,
  fontMetrics: FontMetrics,
  fontSize: number,
): TextExtents => {
  const bounds = findXBounds(positions)
  const minX = bounds?.minX ?? 0
  const maxX = bounds?.maxX ?? 0
  const widthMm = Math.max(0, maxX - minX)
  const emScale = fontSize / Math.max(fontMetrics.unitsPerEm, 1)

  return {
    widthMm,
    minXmm: minX,
    centerXmm: (minX + maxX) / 2,
    ascenderMm: fontMetrics.ascent * emScale,
    descenderMm: fontMetrics.descent * emScale,
  }
}
