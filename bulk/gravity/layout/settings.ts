import type { LevelGeometrySettings } from "../level"
import type { BulkLayoutSettings, BulkLayoutSnapshotConfig } from "./settings.t"

/** Базовый top-down закон размеров для root-shell и внутренних уровней. */
export const DEFAULT_BULK_LAYOUT_SETTINGS: BulkLayoutSettings = {
  levelSizeMultiplier: 2,
  rootInnerDiameterMm: 1000,
  rootSphereRadiusMm: 200,
}

/** Нередактируемый snapshot-контракт layout-а: целевой диаметр root, плотности, минимумы. */
export const DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG: BulkLayoutSnapshotConfig = {
  deepestFieldSphereRadiusMm: 50,
  nestingCoefficient: 0.1,
  packingDensityCoefficient: 1.12,
  rootOuterDiameterMm: 4000,
  sphereMinScaleFactor: 0.5,
}

/**
 * Нормализует частичные layout-настройки в безопасный top-down контракт.
 *
 * Некорректные и неположительные значения заменяются на {@link DEFAULT_BULK_LAYOUT_SETTINGS}.
 */
export const normalizeBulkLayoutSettings = (
  settings: Partial<BulkLayoutSettings> = {},
  config: BulkLayoutSnapshotConfig = DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG,
): BulkLayoutSettings => ({
  levelSizeMultiplier:
    Number.isFinite(settings.levelSizeMultiplier) && (settings.levelSizeMultiplier ?? 0) > 0
      ? settings.levelSizeMultiplier!
      : DEFAULT_BULK_LAYOUT_SETTINGS.levelSizeMultiplier,
  rootInnerDiameterMm:
    Number.isFinite(settings.rootInnerDiameterMm) && (settings.rootInnerDiameterMm ?? 0) > 0
      ? settings.rootInnerDiameterMm!
      : DEFAULT_BULK_LAYOUT_SETTINGS.rootInnerDiameterMm,
  rootSphereRadiusMm:
    Number.isFinite(settings.rootSphereRadiusMm) && (settings.rootSphereRadiusMm ?? 0) > 0
      ? Math.min(settings.rootSphereRadiusMm!, config.rootOuterDiameterMm)
      : DEFAULT_BULK_LAYOUT_SETTINGS.rootSphereRadiusMm,
})

/**
 * Проекция Bulk × Gravity layout-контракта в domain-закон `LevelGeometrySettings`.
 *
 * Опциональный `rootOuterDiameterMm` позволяет вызывающему подменить snapshot-константу
 * (используется в snapshot-builder-е при materialize с нестандартным целевым диаметром).
 */
export const toLevelGeometrySettings = (
  layout: BulkLayoutSettings,
  config: BulkLayoutSnapshotConfig = DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG,
  rootOuterDiameterMm: number = config.rootOuterDiameterMm,
): LevelGeometrySettings => ({
  levelSizeMultiplier: layout.levelSizeMultiplier,
  rootInnerDiameterMm: layout.rootInnerDiameterMm,
  rootSphereRadiusMm: layout.rootSphereRadiusMm,
  rootOuterDiameterMm,
  nestingCoefficient: config.nestingCoefficient,
  packingDensityCoefficient: config.packingDensityCoefficient,
  sphereMinScaleFactor: config.sphereMinScaleFactor,
})
