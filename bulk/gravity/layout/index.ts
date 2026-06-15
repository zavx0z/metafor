/**
 * `@bulk/gravity/layout` — bottom-up закон раскладки shell-иерархии в Bulk × Gravity.
 *
 * Слой отвечает за:
 * - типы и нормализацию `BulkLayoutSettings` (root-размеры; depth задаёт minimum, а не потолок)
 * - проекцию контракта в `LevelGeometrySettings` (см. `@bulk/gravity/level`)
 * - построение `DbWorldRows` из дескрипторов particle-дерева
 * - равномерный scale row-набора к фиксированному внешнему диаметру root без повторного reflow
 *
 * `DbWorldRows` пока используется как промежуточная in-memory форма. Streaming-материализация
 * напрямую в DB заменит её на per-row write через `DbActorStore`.
 */
export type { BulkLayoutSettings, BulkLayoutSnapshotConfig } from "./settings.t"
export {
  DEFAULT_BULK_LAYOUT_SETTINGS,
  DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG,
  normalizeBulkLayoutSettings,
  toLevelGeometrySettings,
} from "./settings"
export type { DbWorldFieldDescriptor, DbWorldParticleDescriptor } from "./snapshot"
export type {
  DbFieldOrbitRow,
  DbFieldValueKind,
  DbParticleActivity,
  DbParticleKind,
  DbParticleShellRow,
  DbWorldRows,
  DbWorldRowSink,
} from "./world"
export {
  createDbWorldRowsFromParticleDescriptors,
  enforceRootShellLayoutSettings,
  scaleDbWorldRowsToRootOuterDiameter,
} from "./snapshot"
export { streamDbWorldRows } from "./stream"
