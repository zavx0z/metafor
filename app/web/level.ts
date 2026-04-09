import { appWebLayoutConfig, type AppWebLayoutSettings, type AppWebRenderSettings } from "./settings.ts"

const TORUS_MAX_SEGMENTS = 96
const SPHERE_BASE_WIDTH_SEGMENTS = 8
const SPHERE_BASE_HEIGHT_SEGMENTS = 6
const SPHERE_MAX_WIDTH_SEGMENTS = 64
const SPHERE_MAX_HEIGHT_SEGMENTS = 48

/** Единый набор параметров одного depth-уровня для раскладки и визуализации `app/web`. */
export interface AppWebLevelMetrics {
  canonicalOuterRadiusMm: number
  depth: number
  detailMultiplier: number | null
  fieldSphereRadiusMm: number
  innerRadiusMm: number
  isLabelVisible: boolean
  labelFontSizeMm: number | null
  labelSurfaceOffsetMm: number | null
  outerRadiusMm: number
  shellRadiusMm: number
  shellTubeMm: number
  sphereHeightSegments: number | null
  sphereWidthSegments: number | null
  torusRadialSegments: number | null
  torusTubularSegments: number | null
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

  const isLabelVisible = renderSettings ? normalizedDepth + 1 <= renderSettings.labelVisibleLevels : false
  const labelFontSizeMm = renderSettings
    ? Math.max(1, renderSettings.labelFontSizeMm / depthSizeScale)
    : null

  const labelSurfaceOffsetMm = renderSettings
    ? renderSettings.labelSurfaceOffsetMm / depthSizeScale
    : null

  const detailMultiplier = renderSettings
    ? renderSettings.detailDensityFactor / Math.pow(renderSettings.detailLevelMultiplier, normalizedDepth)
    : null

  const torusRadialSegments = renderSettings && detailMultiplier !== null
    ? Math.max(3, Math.round(Math.min(renderSettings.torusRadialSegments * detailMultiplier, TORUS_MAX_SEGMENTS)))
    : null

  const torusTubularSegments = renderSettings && detailMultiplier !== null
    ? Math.max(3, Math.round(Math.min(renderSettings.torusTubularSegments * detailMultiplier, TORUS_MAX_SEGMENTS)))
    : null

  const sphereWidthSegments = renderSettings && detailMultiplier !== null
    ? Math.max(3, Math.round(Math.min(SPHERE_BASE_WIDTH_SEGMENTS * detailMultiplier, SPHERE_MAX_WIDTH_SEGMENTS)))
    : null

  const sphereHeightSegments = renderSettings && detailMultiplier !== null
    ? Math.max(2, Math.round(Math.min(SPHERE_BASE_HEIGHT_SEGMENTS * detailMultiplier, SPHERE_MAX_HEIGHT_SEGMENTS)))
    : null

  return {
    canonicalOuterRadiusMm,
    depth: normalizedDepth,
    detailMultiplier,
    fieldSphereRadiusMm,
    innerRadiusMm,
    isLabelVisible,
    labelFontSizeMm,
    labelSurfaceOffsetMm,
    outerRadiusMm: resolvedOuterRadiusMm,
    shellRadiusMm,
    shellTubeMm,
    sphereHeightSegments,
    sphereWidthSegments,
    torusRadialSegments,
    torusTubularSegments,
  }
}
