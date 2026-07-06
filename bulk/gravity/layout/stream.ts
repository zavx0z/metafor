import {
  createBulkManifestFromDarkParticleInputs,
  scaleBulkManifestToRootOuterDiameter,
} from "./snapshot"
import type { BulkDarkParticleInput, BulkManifestSink } from "@metafor/types/bulk/manifest"
import type { BulkLayoutSettings } from "@metafor/types/bulk/settings"

/**
 * Строит Bulk manifest из Dark particle inputs и сразу пишет projection entities в `sink`.
 *
 * Замена связки build + ручного цикла insert: потребитель видит только manifest-emit-flow.
 *
 * Текущая реализация выполняет full layout pass + scale-pass в памяти и только финальный
 * flatten пишет projection entities в sink — это ещё не настоящий single-pass streaming.
 */
export const streamBulkManifest = async (
  rootSrc: string,
  inputs: BulkDarkParticleInput[],
  settings: Partial<BulkLayoutSettings>,
  sink: BulkManifestSink,
): Promise<void> => {
  const manifest = scaleBulkManifestToRootOuterDiameter(
    createBulkManifestFromDarkParticleInputs(rootSrc, inputs, settings),
    undefined,
    settings,
  )
  await sink.clearManifest(manifest.rootSrc)
  for (const darkParticle of manifest.darkParticles) {
    await sink.insertDarkParticle(manifest.rootSrc, darkParticle)
  }
  for (const fieldParticle of manifest.fieldParticles) {
    await sink.insertFieldParticle(manifest.rootSrc, fieldParticle)
  }
}
