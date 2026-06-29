/**
 * `@bulk/gravity/layout` — bottom-up layout law for the Bulk Dark particle hierarchy.
 *
 * Слой отвечает за:
 * - типы и нормализацию `BulkLayoutSettings` (root-размеры; depth задаёт minimum, а не потолок)
 * - проекцию контракта в `LevelGeometrySettings` (см. `@bulk/gravity/level`)
 * - построение `BulkManifest` из Dark particle inputs
 * - равномерный scale manifest-а к фиксированному внешнему диаметру root без повторного reflow
 *
 * `BulkManifest` является runtime/projection contract-ом Bulk, не persistence table shape.
 */
export type { BulkLayoutSettings, BulkLayoutSnapshotConfig } from "./settings.t"
export {
  DEFAULT_BULK_LAYOUT_SETTINGS,
  DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG,
  normalizeBulkLayoutSettings,
  toLevelGeometrySettings,
} from "./settings"
export type { BulkDarkParticleInput, BulkFieldParticleInput } from "./snapshot"
export type {
  BulkDarkParticle,
  BulkDarkParticleActivity,
  BulkDarkParticleKind,
  BulkFieldParticle,
  BulkFieldParticleKind,
  BulkLegacyFieldKind,
  BulkManifest,
  BulkManifestSink,
  BulkOrdinaryFieldKind,
} from "./world"
export {
  createBulkManifestFromDarkParticleInputs,
  scaleBulkManifestToRootOuterDiameter,
} from "./snapshot"
export { streamBulkManifest } from "./stream"
