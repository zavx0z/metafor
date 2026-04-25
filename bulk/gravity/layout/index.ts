/**
 * `@bulk/gravity/layout` — top-down закон раскладки shell-иерархии в Bulk × Gravity.
 *
 * Слой отвечает за:
 * - типы и нормализацию `BulkLayoutSettings` (закон уменьшения вглубь, размеры root)
 * - проекцию контракта в `LevelGeometrySettings` (см. `@bulk/gravity/level`)
 * - построение `DbWorldSnapshot` из дескрипторов particle-дерева
 * - равномерный scale snapshot-а к фиксированному внешнему диаметру root
 *
 * `DbWorldSnapshot` пока используется как промежуточная форма. Streaming-материализация
 * напрямую в DB заменит его в следующей итерации (см. project_streaming_architecture).
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
  createDbWorldSnapshotFromParticleDescriptors,
  enforceRootShellLayoutSettings,
  scaleDbWorldSnapshotToRootOuterDiameter,
} from "./snapshot"
