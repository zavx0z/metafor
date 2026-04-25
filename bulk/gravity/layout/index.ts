/**
 * `@bulk/gravity/layout` — top-down закон раскладки shell-иерархии в Bulk × Gravity.
 *
 * Слой отвечает за:
 * - типы и нормализацию `BulkLayoutSettings` (закон уменьшения вглубь, размеры root)
 * - проекцию контракта в `LevelGeometrySettings` (см. `@bulk/gravity/level`)
 * - построение `DbWorldRows` из дескрипторов particle-дерева
 * - равномерный scale row-набора к фиксированному внешнему диаметру root
 *
 * `DbWorldRows` пока используется как промежуточная in-memory форма. Streaming-материализация
 * напрямую в DB заменит её на per-row write через `DbInstanceStore`.
 */
export type { BulkLayoutSettings, BulkLayoutSnapshotConfig } from "./settings.t"
export {
  DEFAULT_BULK_LAYOUT_SETTINGS,
  DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG,
  normalizeBulkLayoutSettings,
  toLevelGeometrySettings,
} from "./settings"
export type { DbWorldFieldDescriptor, DbWorldParticleDescriptor } from "./snapshot"
export {
  createDbWorldRowsFromParticleDescriptors,
  enforceRootShellLayoutSettings,
  scaleDbWorldRowsToRootOuterDiameter,
} from "./snapshot"
export type { DbWorldRowSink } from "./stream"
export { streamDbWorldRows } from "./stream"
