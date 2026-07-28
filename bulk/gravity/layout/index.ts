/**
 * `@bulk/gravity/layout` — direct recursive layout of the Monad-supplied
 * current Bulk Dark particle hierarchy.
 *
 * Слой отвечает за:
 * - типы и нормализацию `BulkLayoutSettings` (root-размеры; depth задаёт minimum, а не потолок)
 * - проекцию контракта в `LevelGeometrySettings` (см. `@bulk/gravity/level`)
 * - построение `BulkManifest` напрямую из ordered Dark particle inputs без
 *   graph-layout adapter
 * - равномерный scale manifest-а к фиксированному внешнему диаметру root без повторного reflow
 *
 * `BulkManifest` является runtime/projection contract-ом Bulk, не persistence table shape.
 */
export {
  DEFAULT_BULK_LAYOUT_SETTINGS,
  DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG,
  normalizeBulkLayoutSettings,
  toLevelGeometrySettings,
} from "./settings"
export {
  createBulkManifestFromDarkParticleInputs,
  scaleBulkManifestToRootOuterDiameter,
} from "./snapshot"
export { streamBulkManifest } from "./stream"
