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
export { getFontMetrics } from "./font-metrics"
export { resolveTextExtents } from "./extents"
export { resolveSurfaceFitScale } from "./fit"
export { bendTextAroundEquator } from "./projection"
export { createSurfaceLabel } from "./surface"
