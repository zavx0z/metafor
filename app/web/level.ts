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
  innerDiameterMm: number
  innerRadiusMm: number
  isLabelVisible: boolean
  labelFontSizeMm: number | null
  labelSurfaceOffsetMm: number | null
  maxObjectDiameterMm: number
  nestingCoefficient: number
  outerDiameterMm: number
  outerRadiusMm: number
  packingDensityCoefficient: number
  paddingMm: number
  shellRadiusMm: number
  shellTubeMm: number
  sphereDiameterMm: number
  sphereHeightSegments: number | null
  sphereMaxDiameterMm: number
  sphereMinDiameterMm: number
  sphereWidthSegments: number | null
  thicknessMm: number
  torusRadialSegments: number | null
  torusTubularSegments: number | null
  workingThicknessMm: number
}

/** Входные параметры единого расчёта уровня. */
export interface ResolveAppWebLevelMetricsOptions {
  depth: number
  layoutSettings: AppWebLayoutSettings
  outerRadiusMm?: number
  renderSettings?: AppWebRenderSettings
  rootOuterDiameterMm?: number
}

export interface ResolveAppWebOuterRadiusFromFieldSphereRadiusOptions {
  depth: number
  fieldSphereRadiusMm: number
  layoutSettings: AppWebLayoutSettings
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
  const outerDiameterMm = resolvedOuterRadiusMm * 2
  const innerDiameterRatio = layoutSettings.rootInnerDiameterMm / rootOuterDiameterMm
  const innerDiameterMm = Math.min(outerDiameterMm * 0.9, outerDiameterMm * innerDiameterRatio)
  const innerRadiusMm = innerDiameterMm / 2
  const thicknessMm = Math.max(0.001, (outerDiameterMm - innerDiameterMm) / 2)
  const shellTubeMm = thicknessMm / 2
  const shellRadiusMm = innerRadiusMm + shellTubeMm
  const nestingCoefficient = appWebLayoutConfig.snapshot.nestingCoefficient
  const maxObjectDiameterMm = Math.max(0.001, outerDiameterMm * nestingCoefficient)
  const sphereMinDiameterMm = maxObjectDiameterMm * appWebLayoutConfig.snapshot.sphereMinScaleFactor
  const sphereMaxDiameterMm = maxObjectDiameterMm
  const rootMaxObjectDiameterMm = rootOuterDiameterMm * nestingCoefficient
  const sphereScaleFactor = Math.min(
    1,
    Math.max(
      appWebLayoutConfig.snapshot.sphereMinScaleFactor,
      layoutSettings.rootSphereRadiusMm / rootMaxObjectDiameterMm,
    ),
  )
  const sphereDiameterMm = maxObjectDiameterMm * sphereScaleFactor
  const fieldSphereRadiusMm = sphereDiameterMm / 2
  const packingDensityCoefficient = appWebLayoutConfig.snapshot.packingDensityCoefficient
  const paddingMm = Math.max(0, maxObjectDiameterMm * (packingDensityCoefficient - 1))
  const workingThicknessMm = Math.max(0.001, thicknessMm - paddingMm * 2)

  const isLabelVisible = renderSettings
    ? normalizedDepth > renderSettings.baseDepth &&
      normalizedDepth <= renderSettings.baseDepth + renderSettings.labelVisibleLevels
    : false

  const labelScale = resolvedOuterRadiusMm / (rootOuterDiameterMm / 2)

  const labelFontSizeMm = renderSettings
    ? Math.max(1e-6, renderSettings.labelFontSizeMm * labelScale)
    : null

  const labelSurfaceOffsetMm = renderSettings
    ? renderSettings.labelSurfaceOffsetMm * labelScale
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
    innerDiameterMm,
    innerRadiusMm,
    isLabelVisible,
    labelFontSizeMm,
    labelSurfaceOffsetMm,
    maxObjectDiameterMm,
    nestingCoefficient,
    outerDiameterMm,
    outerRadiusMm: resolvedOuterRadiusMm,
    packingDensityCoefficient,
    paddingMm,
    shellRadiusMm,
    shellTubeMm,
    sphereDiameterMm,
    sphereHeightSegments,
    sphereMaxDiameterMm,
    sphereMinDiameterMm,
    sphereWidthSegments,
    thicknessMm,
    torusRadialSegments,
    torusTubularSegments,
    workingThicknessMm,
  }
}

/** Восстанавливает внешний радиус depth-уровня по радиусу peer field-сферы того же уровня. */
export const resolveAppWebOuterRadiusFromFieldSphereRadius = ({
  depth,
  fieldSphereRadiusMm,
  layoutSettings,
  rootOuterDiameterMm = appWebLayoutConfig.snapshot.rootOuterDiameterMm,
}: ResolveAppWebOuterRadiusFromFieldSphereRadiusOptions): number => {
  const safeFieldSphereRadiusMm = Math.max(0, fieldSphereRadiusMm)
  if (!(safeFieldSphereRadiusMm > 0)) return 0

  const canonicalMetrics = resolveAppWebLevelMetrics({
    depth,
    layoutSettings,
    rootOuterDiameterMm,
  })
  const fieldToOuterRadiusRatio = canonicalMetrics.fieldSphereRadiusMm / canonicalMetrics.outerRadiusMm
  if (!(fieldToOuterRadiusRatio > 1e-6)) return safeFieldSphereRadiusMm

  return safeFieldSphereRadiusMm / fieldToOuterRadiusRatio
}
