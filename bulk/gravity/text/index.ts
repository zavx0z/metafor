/**
 * `@bulk/gravity/text` — typography layer для surface-меток.
 *
 * Подход: equator-only деформация. Текст изгибается по параллели поверхности (горизонтальная
 * дуга), но остаётся плоским по меридиану. Это сохраняет «налепленность» на поверхность для
 * широкого текста, но descender/ascender физически не могут выйти за силуэт поверхности.
 *
 * Публичные слои:
 * - `font-metrics` — извлечение `ascent`/`descent`/`unitsPerEm` из `TrueTypeFont`
 * - `extents` — `TextExtents` (width из позиций, ascender/descender из font metrics — стабильны между строками)
 * - `fit` — `SurfaceArcLimits` + `resolveSurfaceFitScale` по ширине
 * - `projection` — equator-bend `bendTextAroundEquator`
 * - `surface` — high-level `createSurfaceLabel` с автоподбором font-size
 */
export type { FontMetrics } from "./font-metrics"
export { getFontMetrics } from "./font-metrics"
export type { TextExtents } from "./extents"
export { resolveTextExtents } from "./extents"
export type { SurfaceArcLimits, ResolveSurfaceFitScaleOptions } from "./fit"
export { resolveSurfaceFitScale } from "./fit"
export type { BendTextAroundEquatorOptions } from "./projection"
export { bendTextAroundEquator } from "./projection"
export type { CreateSurfaceLabelOptions, SurfaceLabel } from "./surface"
export { createSurfaceLabel } from "./surface"
