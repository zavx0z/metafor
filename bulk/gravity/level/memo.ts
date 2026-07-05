import type { LevelDetail, LevelGeometry, LevelLabel, LevelResolver, LevelSettings } from "@metafor/types/bulk/level"
import { resolveLevelDetail } from "./detail"
import { resolveLevelGeometry } from "./geometry"
import { resolveLevelLabel } from "./label"

/**
 * Ленивый кэшированный резолвер уровней.
 *
 * Canonical расчёты (`getGeometry(depth)` без override, `getDetail`, `getLabel`)
 * мемоизируются по `depth` для снятия per-frame нагрузки на resolvers.
 * Override через `outerRadiusMm` не кэшируется: ключ уникален для конкретной torus geometry.
 *
 * При смене настроек (например, из UI) вызывающий должен вызвать {@link LevelResolver.invalidate}.
 */
export const createLevelResolver = (settings: LevelSettings): LevelResolver => {
  const geometryCache = new Map<number, LevelGeometry>()
  const detailCache = new Map<number, LevelDetail>()
  const labelCache = new Map<number, LevelLabel>()

  const getGeometry = (depth: number, outerRadiusMm?: number): LevelGeometry => {
    if (outerRadiusMm === undefined) {
      const cached = geometryCache.get(depth)
      if (cached) return cached
      const computed = resolveLevelGeometry({ depth, settings: settings.geometry })
      geometryCache.set(depth, computed)
      return computed
    }
    return resolveLevelGeometry({ depth, settings: settings.geometry, outerRadiusMm })
  }

  const getDetail = (depth: number): LevelDetail => {
    const cached = detailCache.get(depth)
    if (cached) return cached
    const computed = resolveLevelDetail(depth, settings.detail)
    detailCache.set(depth, computed)
    return computed
  }

  const getLabel = (depth: number): LevelLabel => {
    const cached = labelCache.get(depth)
    if (cached) return cached
    const canonicalGeometry = getGeometry(depth)
    const computed = resolveLevelLabel(depth, settings.label, canonicalGeometry.levelScale)
    labelCache.set(depth, computed)
    return computed
  }

  const invalidate = (): void => {
    geometryCache.clear()
    detailCache.clear()
    labelCache.clear()
  }

  return { getGeometry, getDetail, getLabel, invalidate }
}
