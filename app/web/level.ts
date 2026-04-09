import { appWebLayoutConfig, type AppWebLayoutSettings, type AppWebRenderSettings } from "./settings.ts"

/** Единый набор параметров одного depth-уровня для раскладки и визуализации `app/web`. */
export interface AppWebLevelMetrics {
  canonicalOuterRadiusMm: number
  depth: number
  detailMultiplier: number | null
  fieldSphereRadiusMm: number
  innerRadiusMm: number
  labelFontSizeMm: number | null
  outerRadiusMm: number
  shellRadiusMm: number
  shellTubeMm: number
}

/** Входные параметры единого расчёта уровня. */
export interface ResolveAppWebLevelMetricsOptions {
  depth: number
  layoutSettings: AppWebLayoutSettings
  outerRadiusMm?: number
  renderSettings?: AppWebRenderSettings
  rootOuterDiameterMm?: number
}

/** Вычисляет единый набор параметров одного уровня по top-down закону настроек. */
export const resolveAppWebLevelMetrics = ({
  depth,
  layoutSettings,
  outerRadiusMm,
  renderSettings,
  rootOuterDiameterMm = appWebLayoutConfig.snapshot.rootOuterDiameterMm,
}: ResolveAppWebLevelMetricsOptions): AppWebLevelMetrics => {
  const normalizedDepth = Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 0
  const depthSizeScale = Math.pow(layoutSettings.levelSizeMultiplier, normalizedDepth)
  const canonicalOuterRadiusMm = Math.max(0.001, rootOuterDiameterMm / 2 / depthSizeScale)
  const resolvedOuterRadiusMm = outerRadiusMm ?? canonicalOuterRadiusMm
  const innerDiameterRatio = layoutSettings.rootInnerDiameterMm / rootOuterDiameterMm
  const innerRadiusMm = Math.min(resolvedOuterRadiusMm * 0.9, resolvedOuterRadiusMm * innerDiameterRatio)
  const shellRadiusMm = (resolvedOuterRadiusMm + innerRadiusMm) / 2
  const shellTubeMm = (resolvedOuterRadiusMm - innerRadiusMm) / 2
  const fieldSphereRadiusMm = Math.max(0.001, layoutSettings.rootSphereRadiusMm / 2 / depthSizeScale)
  const labelFontSizeMm = renderSettings
    ? Math.max(1, renderSettings.labelFontSizeMm / depthSizeScale)
    : null
  const detailMultiplier = renderSettings
    ? renderSettings.detailDensityFactor / Math.pow(renderSettings.detailLevelMultiplier, normalizedDepth)
    : null

  return {
    canonicalOuterRadiusMm,
    depth: normalizedDepth,
    detailMultiplier,
    fieldSphereRadiusMm,
    innerRadiusMm,
    labelFontSizeMm,
    outerRadiusMm: resolvedOuterRadiusMm,
    shellRadiusMm,
    shellTubeMm,
  }
}
