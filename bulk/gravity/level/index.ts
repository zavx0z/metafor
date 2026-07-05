/**
 * `@bulk/gravity/level` — закон размерной иерархии Dark particles и метрик уровней.
 *
 * Разделение на три слоя отвечает принципу `Domain × Force × Entity` из `docs/ARCHITECTURE.md`:
 * в Bulk × Gravity живёт манифестированная геометрия WIMP/Fuzzy/MACHO/Axion,
 * её детализация для wireframe и вывод метрик подписей по глубине.
 *
 * Публичные слои:
 * - `geometry` — чистые размеры (outerR/innerR/shellR/tube/sphereR/thickness/padding) + `levelScale`
 * - `detail` — сегментация тора и сферы с ослаблением по глубине
 * - `label` — видимость и масштабирование подписи (font size, surface offset)
 * - `memo` — ленивый кэшированный резолвер всех трёх слоёв
 */
export { resolveLevelDetail } from "./detail"
export { resolveLevelGeometry, resolveLevelScale, resolveOuterRadiusFromSphereRadius } from "./geometry"
export { resolveLevelLabel } from "./label"
export { createLevelResolver } from "./memo"
