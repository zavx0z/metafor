/**
 * `@bulk/gravity/text` — typography layer для surface-меток.
 *
 * Решает три проблемы прежней реализации (`bulk/surface-label.ts` + `bulk/web.ts`):
 * 1. `bbox-center` как якорь (из-за этого descender `y` обрезается):
 *    заменён на typographic **baseline = y=0**.
 * 2. Единый `fitScale` по ширине без учёта высоты:
 *    теперь три независимых лимита дуги (ширина / ascender / descender), `fitScale = min(...)`.
 * 3. Нестабильность размера между строками (per-string bbox):
 *    ascender/descender берутся из `hhea` шрифта, не из конкретного набора глифов в строке.
 *
 * Публичные слои:
 * - `font-metrics` — извлечение `ascent`/`descent`/`unitsPerEm` из `TrueTypeFont`
 * - `extents` — `TextExtents` (width, ascender, descender, centerX) для конкретной строки
 * - `fit` — единый `SurfaceArcLimits` + `resolveSurfaceFitScale`
 * - `projection` — baseline-aware проекторы `projectSurfaceText` для сферы и тора
 * - `surface` — high-level `createSurfaceLabel` с автоподбором font-size
 */
export type { FontMetrics } from "./font-metrics"
export { getFontMetrics } from "./font-metrics"
export type { TextExtents } from "./extents"
export { resolveTextExtents } from "./extents"
export type { SurfaceArcLimits, SurfaceCurveRadii, ResolveSurfaceFitScaleOptions } from "./fit"
export { resolveSurfaceFitScale } from "./fit"
export type {
  SphereProjectionParams,
  TorusProjectionParams,
  SurfaceProjection,
  ProjectSurfaceTextOptions,
} from "./projection"
export { projectSurfaceText } from "./projection"
export type { CreateSurfaceLabelOptions, SurfaceLabel } from "./surface"
export { createSurfaceLabel } from "./surface"
