export interface AppWebLayoutSettings {
  levelSizeMultiplier: number
  rootInnerDiameterMm: number
}

export interface AppWebRenderSettings {
  detailDensityFactor: number
  detailLevelMultiplier: number
}

export const DEFAULT_APP_WEB_LAYOUT_SETTINGS: AppWebLayoutSettings = {
  levelSizeMultiplier: 4,
  rootInnerDiameterMm: 1000,
}

export const DEFAULT_APP_WEB_RENDER_SETTINGS: AppWebRenderSettings = {
  detailDensityFactor: 2,
  detailLevelMultiplier: 1.5,
}

export const normalizeAppWebLayoutSettings = (
  settings: Partial<AppWebLayoutSettings> = {},
): AppWebLayoutSettings => ({
  levelSizeMultiplier:
    Number.isFinite(settings.levelSizeMultiplier) && (settings.levelSizeMultiplier ?? 0) > 0
      ? settings.levelSizeMultiplier!
      : DEFAULT_APP_WEB_LAYOUT_SETTINGS.levelSizeMultiplier,
  rootInnerDiameterMm:
    Number.isFinite(settings.rootInnerDiameterMm) && (settings.rootInnerDiameterMm ?? 0) > 0
      ? settings.rootInnerDiameterMm!
      : DEFAULT_APP_WEB_LAYOUT_SETTINGS.rootInnerDiameterMm,
})

export const normalizeAppWebRenderSettings = (
  settings: Partial<AppWebRenderSettings> = {},
): AppWebRenderSettings => ({
  detailDensityFactor:
    Number.isFinite(settings.detailDensityFactor) && (settings.detailDensityFactor ?? 0) > 0
      ? settings.detailDensityFactor!
      : DEFAULT_APP_WEB_RENDER_SETTINGS.detailDensityFactor,
  detailLevelMultiplier:
    Number.isFinite(settings.detailLevelMultiplier) && (settings.detailLevelMultiplier ?? 0) > 0
      ? settings.detailLevelMultiplier!
      : DEFAULT_APP_WEB_RENDER_SETTINGS.detailLevelMultiplier,
})
