/**
 * `@bulk/gravity/level` — закон размерной иерархии бран и метрик уровней.
 *
 * Разделение на три слоя отвечает принципу `Domain × Force × Entity` из `docs/ARCHITECTURE.md`:
 * в Bulk × Gravity живёт манифестированная геометрия актёров, её детализация для wireframe
 * и вывод метрик подписей по глубине.
 *
 * Публичные слои:
 * - `geometry` — чистые размеры (outerR/innerR/shellR/tube/sphereR/thickness/padding) + `levelScale`
 * - `detail` — сегментация тора и сферы с ослаблением по глубине
 * - `label` — видимость и масштабирование подписи (font size, surface offset)
 * - `memo` — ленивый кэшированный резолвер всех трёх слоёв
 */
export type { LevelDetail } from "./detail.t"
export { resolveLevelDetail } from "./detail"
export type { LevelGeometry, ResolveLevelGeometryOptions } from "./geometry.t"
export { resolveLevelGeometry, resolveLevelScale, resolveOuterRadiusFromSphereRadius } from "./geometry"
export type { LevelLabel } from "./label.t"
export { resolveLevelLabel } from "./label"
export { createLevelResolver, type LevelResolver } from "./memo"
export type {
  LevelDetailSettings,
  LevelGeometrySettings,
  LevelLabelSettings,
  LevelSettings,
} from "./settings.t"
