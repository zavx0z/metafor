import type { LevelDetail, LevelDetailSettings } from "@metafor/types/bulk/level"

const normalizeDepth = (depth: number): number =>
  Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 0

/**
 * Единый расчёт детализации wireframe на одном depth.
 *
 * На корневом уровне (`depth=0`) множитель равен `detailDensityFactor`.
 * На каждом следующем уровне делится на `detailLevelMultiplier`.
 */
export const resolveLevelDetail = (
  depth: number,
  settings: LevelDetailSettings,
): LevelDetail => {
  const normalizedDepth = normalizeDepth(depth)
  const detailMultiplier =
    settings.detailDensityFactor / Math.pow(settings.detailLevelMultiplier, normalizedDepth)

  const clampSegments = (base: number, max: number, min: number): number =>
    Math.max(min, Math.round(Math.min(base * detailMultiplier, max)))

  return {
    depth: normalizedDepth,
    detailMultiplier,
    torusRadialSegments: clampSegments(settings.torusRadialSegments, settings.torusMaxSegments, 3),
    torusTubularSegments: clampSegments(settings.torusTubularSegments, settings.torusMaxSegments, 3),
    sphereWidthSegments: clampSegments(
      settings.sphereBaseWidthSegments,
      settings.sphereMaxWidthSegments,
      3,
    ),
    sphereHeightSegments: clampSegments(
      settings.sphereBaseHeightSegments,
      settings.sphereMaxHeightSegments,
      2,
    ),
  }
}
