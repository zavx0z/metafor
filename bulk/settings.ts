import type {
  BulkRenderSettings,
  BulkSettingsConfig,
  BulkViewportConfig,
} from "@metafor/types/bulk/settings"

export const DEFAULT_BULK_SCENE_SRC = ""

/** Viewport-only settings. Geometry and mesh detail come from pkg/visual. */
export const DEFAULT_BULK_SETTINGS: BulkSettingsConfig = {
  render: {
    labelVisibleLevels: 1,
    baseDepth: 0,
    labelFontSizeMm: 0.8,
    labelSurfaceOffsetMm: 1,
  },
}

export const bulkViewportConfig: BulkViewportConfig = {
  viewport: {
    camera: {
      fovRad: (2 * Math.PI) / 5,
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
    },
  },
}

export const normalizeBulkRenderSettings = (
  settings: Partial<BulkRenderSettings> = {},
): BulkRenderSettings => ({
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
})
