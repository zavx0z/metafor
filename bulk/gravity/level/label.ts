import type { LevelLabel, LevelLabelSettings } from "@metafor/types/bulk/level"

const normalizeDepth = (depth: number): number =>
  Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 0

/**
 * Видимость и метрики подписи на уровне `depth`.
 *
 * `levelScale` передаётся снаружи (обычно из соответствующей {@link LevelGeometry})
 * для единообразного масштабирования без локального дублирования закона.
 */
export const resolveLevelLabel = (
  depth: number,
  settings: LevelLabelSettings,
  levelScale: number,
): LevelLabel => {
  const normalizedDepth = normalizeDepth(depth)
  const isVisible =
    normalizedDepth > settings.baseDepth &&
    normalizedDepth <= settings.baseDepth + settings.visibleLevels

  const safeScale = Number.isFinite(levelScale) && levelScale > 0 ? levelScale : 1

  return {
    depth: normalizedDepth,
    isVisible,
    fontSizeMm: Math.max(1e-6, settings.fontSizeMm * safeScale),
    surfaceOffsetMm: Math.max(0, settings.surfaceOffsetMm * safeScale),
  }
}
