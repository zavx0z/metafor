import type { DbActorStore } from "@store/actor"
import {
  createDbWorldRowsFromParticleDescriptors,
  scaleDbWorldRowsToRootOuterDiameter,
  type DbWorldParticleDescriptor,
} from "./snapshot"
import type { BulkLayoutSettings } from "./settings.t"

/**
 * Лёгкий sink-API: подмножество {@link DbActorStore}, нужное layout-builder-у для
 * потоковой записи row-ов. Реализуется и SQLite, и IDB store-ом, либо тестовым stub-ом.
 */
export type DbWorldRowSink = Pick<
  DbActorStore,
  "clearWorld" | "insertParticleShell" | "insertFieldOrbit"
>

/**
 * Строит row-набор world-структуры из particle-descriptors и сразу пишет его per-row в `sink`.
 *
 * Замена связки `buildDbWorldRows` + ручного цикла insert: dark.worker не держит
 * промежуточный `DbWorldRows` объект, потребитель видит только row-emit-flow.
 *
 * Текущая реализация выполняет full layout pass + scale-pass в памяти и только финальный
 * flatten делает per-row в sink — это ещё не настоящий single-pass streaming, но ground для
 * него и устранение `DbWorldRows` из публичного API dark.worker-а.
 */
export const streamDbWorldRows = async (
  rootSrc: string,
  descriptors: DbWorldParticleDescriptor[],
  settings: Partial<BulkLayoutSettings>,
  sink: DbWorldRowSink,
): Promise<void> => {
  const rows = scaleDbWorldRowsToRootOuterDiameter(
    createDbWorldRowsFromParticleDescriptors(rootSrc, descriptors, settings),
    undefined,
    settings,
  )
  await sink.clearWorld(rows.rootSrc)
  for (const shell of rows.particles) {
    await sink.insertParticleShell(rows.rootSrc, shell)
  }
  for (const orbit of rows.fields) {
    await sink.insertFieldOrbit(rows.rootSrc, orbit)
  }
}
