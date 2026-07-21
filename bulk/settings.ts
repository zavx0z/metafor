import type { LevelDetailSettings, LevelLabelSettings, LevelSettings } from "@metafor/types/bulk/level"
import type {
  BulkLayoutConfig,
  BulkLayoutSettings,
  BulkRenderSettings,
  BulkSettingsConfig,
} from "@metafor/types/bulk/settings"
import {
  DEFAULT_BULK_LAYOUT_SETTINGS,
  DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG,
  toLevelGeometrySettings,
} from "@bulk/gravity/layout"

export const DEFAULT_BULK_SCENE_SRC = ""

/** Единственный программный источник визуальных законов Bulk. */
export const DEFAULT_BULK_SETTINGS: BulkSettingsConfig = {
  layout: { ...DEFAULT_BULK_LAYOUT_SETTINGS },
  render: {
    animationEnabled: false,
    detailDensityFactor: 2,
    detailLevelMultiplier: 1,
    labelVisibleLevels: 2,
    baseDepth: 0,
    labelFontSizeMm: DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm * 0.02,
    labelSurfaceOffsetMm: DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm * 0.01,
    torusCrossRingRotationDeg: 44,
    torusRadialSegments: 14,
    torusTubularSegments: 48,
    wireframeOpacity: 0.08,
  },
}

/** Layout-контракт Bulk: viewport-камера, сетка, fallback torus geometry. */
export const bulkLayoutConfig: BulkLayoutConfig = {
  viewport: {
    axesSizeMm: 1000,
    camera: {
      fovRad: (2 * Math.PI) / 5,
      // FIXME(deep-space): текущий диапазон near/far рассчитан на сцену, где
      // 1 scene unit = 1 mm. Для более глубокого пространства нельзя просто
      // увеличивать `far`: отдельно понадобятся dynamic near/far, split frustum
      // или origin rebasing. Пока не реализовывать — только фиксируем ограничение.
      near: 1,
      far: 100000,
      position: { x: 3975.6752784123818, y: -2981.756458809286, z: 1650 },
      target: { x: 0, y: 0, z: 1100 },
    },
    grid: {
      sizeMm: 8000,
      divisions: 16,
      centerColorHex: 0x202631,
      colorHex: 0x343b49,
    },
    levelsMm: {
      floor: 0,
      elbow: 1100,
      eye: 1650,
    },
    torusFallbackMm: {
      radius: 200,
      tube: 140,
    },
  },
}

const TORUS_MAX_SEGMENTS = 96
const SPHERE_BASE_WIDTH_SEGMENTS = 16
const SPHERE_BASE_HEIGHT_SEGMENTS = 12
const SPHERE_MAX_WIDTH_SEGMENTS = 64
const SPHERE_MAX_HEIGHT_SEGMENTS = 48

/** Проекция layout-закона в `LevelGeometrySettings` из Bulk x Gravity. */
export const toBulkLevelGeometrySettings = (
  layout: BulkLayoutSettings,
  rootOuterDiameterMm: number = DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm,
) => toLevelGeometrySettings(layout, DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG, rootOuterDiameterMm)

/** Проекция render-закона в `LevelDetailSettings`. */
export const toLevelDetailSettings = (render: BulkRenderSettings): LevelDetailSettings => ({
  detailDensityFactor: render.detailDensityFactor,
  detailLevelMultiplier: render.detailLevelMultiplier,
  torusRadialSegments: render.torusRadialSegments,
  torusTubularSegments: render.torusTubularSegments,
  torusMaxSegments: TORUS_MAX_SEGMENTS,
  sphereBaseWidthSegments: SPHERE_BASE_WIDTH_SEGMENTS,
  sphereBaseHeightSegments: SPHERE_BASE_HEIGHT_SEGMENTS,
  sphereMaxWidthSegments: SPHERE_MAX_WIDTH_SEGMENTS,
  sphereMaxHeightSegments: SPHERE_MAX_HEIGHT_SEGMENTS,
})

/** Проекция render-закона в `LevelLabelSettings`. */
export const toLevelLabelSettings = (render: BulkRenderSettings): LevelLabelSettings => ({
  baseDepth: render.baseDepth,
  fontSizeMm: render.labelFontSizeMm,
  surfaceOffsetMm: render.labelSurfaceOffsetMm,
  visibleLevels: render.labelVisibleLevels,
})

/** Составная проекция layout/render-законов в `LevelSettings`. */
export const toLevelSettings = (
  layout: BulkLayoutSettings,
  render: BulkRenderSettings,
  rootOuterDiameterMm?: number,
): LevelSettings => ({
  geometry:
    rootOuterDiameterMm !== undefined
      ? toBulkLevelGeometrySettings(layout, rootOuterDiameterMm)
      : toBulkLevelGeometrySettings(layout),
  detail: toLevelDetailSettings(render),
  label: toLevelLabelSettings(render),
})

/** Нормализует внутренний render-закон относительно канонической конфигурации. */
export const normalizeBulkRenderSettings = (
  settings: Partial<BulkRenderSettings> = {},
): BulkRenderSettings => ({
  animationEnabled:
    typeof settings.animationEnabled === "boolean"
      ? settings.animationEnabled
      : DEFAULT_BULK_SETTINGS.render.animationEnabled,
  detailDensityFactor:
    Number.isFinite(settings.detailDensityFactor) && (settings.detailDensityFactor ?? 0) > 0
      ? settings.detailDensityFactor!
      : DEFAULT_BULK_SETTINGS.render.detailDensityFactor,
  detailLevelMultiplier:
    Number.isFinite(settings.detailLevelMultiplier) && (settings.detailLevelMultiplier ?? 0) > 0
      ? settings.detailLevelMultiplier!
      : DEFAULT_BULK_SETTINGS.render.detailLevelMultiplier,
  labelVisibleLevels:
    Number.isFinite(settings.labelVisibleLevels) && (settings.labelVisibleLevels ?? 0) > 0
      ? Math.max(1, Math.round(settings.labelVisibleLevels!))
      : DEFAULT_BULK_SETTINGS.render.labelVisibleLevels,
  baseDepth:
    Number.isFinite(settings.baseDepth) && (settings.baseDepth ?? -1) >= -1
      ? Math.floor(settings.baseDepth!)
      : DEFAULT_BULK_SETTINGS.render.baseDepth,
  labelFontSizeMm:
    Number.isFinite(settings.labelFontSizeMm) && (settings.labelFontSizeMm ?? 0) > 0
      ? settings.labelFontSizeMm!
      : DEFAULT_BULK_SETTINGS.render.labelFontSizeMm,
  labelSurfaceOffsetMm:
    Number.isFinite(settings.labelSurfaceOffsetMm) && (settings.labelSurfaceOffsetMm ?? 0) >= 0
      ? settings.labelSurfaceOffsetMm!
      : DEFAULT_BULK_SETTINGS.render.labelSurfaceOffsetMm,
  torusCrossRingRotationDeg:
    Number.isFinite(settings.torusCrossRingRotationDeg)
      ? settings.torusCrossRingRotationDeg!
      : DEFAULT_BULK_SETTINGS.render.torusCrossRingRotationDeg,
  torusRadialSegments:
    Number.isFinite(settings.torusRadialSegments) && (settings.torusRadialSegments ?? 0) > 0
      ? Math.max(3, Math.round(settings.torusRadialSegments!))
      : DEFAULT_BULK_SETTINGS.render.torusRadialSegments,
  torusTubularSegments:
    Number.isFinite(settings.torusTubularSegments) && (settings.torusTubularSegments ?? 0) > 0
      ? Math.max(3, Math.round(settings.torusTubularSegments!))
      : DEFAULT_BULK_SETTINGS.render.torusTubularSegments,
  wireframeOpacity:
    Number.isFinite(settings.wireframeOpacity) && (settings.wireframeOpacity ?? 0) >= 0
      ? Math.max(0, Math.min(1, settings.wireframeOpacity!))
      : DEFAULT_BULK_SETTINGS.render.wireframeOpacity,
})
