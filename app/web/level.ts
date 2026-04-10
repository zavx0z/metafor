import { appWebLayoutConfig, type AppWebLayoutSettings, type AppWebRenderSettings } from "./settings.ts"

const TORUS_MAX_SEGMENTS = 96
const SPHERE_BASE_WIDTH_SEGMENTS = 16
const SPHERE_BASE_HEIGHT_SEGMENTS = 12
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
  levelScale: number
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
  surfaceScale: number
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

interface AppWebRootLevelGeometryMetrics {
  fieldSphereRadiusMm: number
  innerDiameterMm: number
  innerRadiusMm: number
  maxObjectDiameterMm: number
  outerDiameterMm: number
  outerRadiusMm: number
  paddingMm: number
  shellRadiusMm: number
  shellTubeMm: number
  sphereDiameterMm: number
  sphereMaxDiameterMm: number
  sphereMinDiameterMm: number
  thicknessMm: number
  workingThicknessMm: number
}

const normalizeAppWebLevelDepth = (depth: number): number =>
  Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 0

export const resolveAppWebLevelScale = (
  depth: number,
  layoutSettings: AppWebLayoutSettings,
): number => {
  const normalizedDepth = normalizeAppWebLevelDepth(depth)
  return 1 / Math.pow(layoutSettings.levelSizeMultiplier, normalizedDepth)
}

const scaleLinearMetric = (value: number | null, scale: number): number | null =>
  value === null ? null : Math.max(1e-6, value * scale)

const scaleNonNegativeMetric = (value: number | null, scale: number): number | null =>
  value === null ? null : Math.max(0, value * scale)

const scaleRootLevelGeometryMetrics = (
  rootMetrics: AppWebRootLevelGeometryMetrics,
  scale: number,
): AppWebRootLevelGeometryMetrics => ({
  fieldSphereRadiusMm: rootMetrics.fieldSphereRadiusMm * scale,
  innerDiameterMm: rootMetrics.innerDiameterMm * scale,
  innerRadiusMm: rootMetrics.innerRadiusMm * scale,
  maxObjectDiameterMm: rootMetrics.maxObjectDiameterMm * scale,
  outerDiameterMm: rootMetrics.outerDiameterMm * scale,
  outerRadiusMm: rootMetrics.outerRadiusMm * scale,
  paddingMm: rootMetrics.paddingMm * scale,
  shellRadiusMm: rootMetrics.shellRadiusMm * scale,
  shellTubeMm: rootMetrics.shellTubeMm * scale,
  sphereDiameterMm: rootMetrics.sphereDiameterMm * scale,
  sphereMaxDiameterMm: rootMetrics.sphereMaxDiameterMm * scale,
  sphereMinDiameterMm: rootMetrics.sphereMinDiameterMm * scale,
  thicknessMm: rootMetrics.thicknessMm * scale,
  workingThicknessMm: rootMetrics.workingThicknessMm * scale,
})

const resolveAppWebRootLevelGeometryMetrics = (
  layoutSettings: AppWebLayoutSettings,
  rootOuterDiameterMm: number,
): {
  geometry: AppWebRootLevelGeometryMetrics
  nestingCoefficient: number
  packingDensityCoefficient: number
} => {
  const nestingCoefficient = appWebLayoutConfig.snapshot.nestingCoefficient
  const packingDensityCoefficient = appWebLayoutConfig.snapshot.packingDensityCoefficient
  const outerDiameterMm = rootOuterDiameterMm
  const outerRadiusMm = outerDiameterMm / 2
  const innerDiameterRatio = layoutSettings.rootInnerDiameterMm / rootOuterDiameterMm
  const innerDiameterMm = Math.min(outerDiameterMm * 0.9, outerDiameterMm * innerDiameterRatio)
  const innerRadiusMm = innerDiameterMm / 2
  const thicknessMm = Math.max(0.001, (outerDiameterMm - innerDiameterMm) / 2)
  const shellTubeMm = thicknessMm / 2
  const shellRadiusMm = innerRadiusMm + shellTubeMm
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
  const paddingMm = Math.max(0, maxObjectDiameterMm * (packingDensityCoefficient - 1))
  const workingThicknessMm = Math.max(0.001, thicknessMm - paddingMm * 2)

  return {
    geometry: {
      fieldSphereRadiusMm,
      innerDiameterMm,
      innerRadiusMm,
      maxObjectDiameterMm,
      outerDiameterMm,
      outerRadiusMm,
      paddingMm,
      shellRadiusMm,
      shellTubeMm,
      sphereDiameterMm,
      sphereMaxDiameterMm,
      sphereMinDiameterMm,
      thicknessMm,
      workingThicknessMm,
    },
    nestingCoefficient,
    packingDensityCoefficient,
  }
}

const applyAppWebResolvedSurfaceScale = (
  metrics: AppWebLevelMetrics,
  surfaceScale: number,
): AppWebLevelMetrics => {
  if (!Number.isFinite(surfaceScale) || surfaceScale <= 0) return metrics
  if (Math.abs(surfaceScale - 1) <= 1e-9) return metrics

  return {
    ...metrics,
    fieldSphereRadiusMm: metrics.fieldSphereRadiusMm * surfaceScale,
    innerDiameterMm: metrics.innerDiameterMm * surfaceScale,
    innerRadiusMm: metrics.innerRadiusMm * surfaceScale,
    labelSurfaceOffsetMm: scaleNonNegativeMetric(metrics.labelSurfaceOffsetMm, surfaceScale),
    maxObjectDiameterMm: metrics.maxObjectDiameterMm * surfaceScale,
    outerDiameterMm: metrics.outerDiameterMm * surfaceScale,
    outerRadiusMm: metrics.outerRadiusMm * surfaceScale,
    paddingMm: metrics.paddingMm * surfaceScale,
    shellRadiusMm: metrics.shellRadiusMm * surfaceScale,
    shellTubeMm: metrics.shellTubeMm * surfaceScale,
    sphereDiameterMm: metrics.sphereDiameterMm * surfaceScale,
    sphereMaxDiameterMm: metrics.sphereMaxDiameterMm * surfaceScale,
    sphereMinDiameterMm: metrics.sphereMinDiameterMm * surfaceScale,
    surfaceScale,
    thicknessMm: metrics.thicknessMm * surfaceScale,
    workingThicknessMm: metrics.workingThicknessMm * surfaceScale,
  }
}

export interface ResolveAppWebCanonicalLevelMetricsOptions {
  depth: number
  layoutSettings: AppWebLayoutSettings
  renderSettings?: AppWebRenderSettings
  rootOuterDiameterMm?: number
}

/** Возвращает canonical level-contract для depth без локальных surface override. */
export const resolveAppWebCanonicalLevelMetrics = ({
  depth,
  layoutSettings,
  renderSettings,
  rootOuterDiameterMm = appWebLayoutConfig.snapshot.rootOuterDiameterMm,
}: ResolveAppWebCanonicalLevelMetricsOptions): AppWebLevelMetrics => {
  const normalizedDepth = normalizeAppWebLevelDepth(depth)
  const levelScale = resolveAppWebLevelScale(normalizedDepth, layoutSettings)
  const { geometry: rootGeometry, nestingCoefficient, packingDensityCoefficient } =
    resolveAppWebRootLevelGeometryMetrics(layoutSettings, rootOuterDiameterMm)
  const geometry = scaleRootLevelGeometryMetrics(rootGeometry, levelScale)

  const isLabelVisible = renderSettings
    ? normalizedDepth > renderSettings.baseDepth &&
      normalizedDepth <= renderSettings.baseDepth + renderSettings.labelVisibleLevels
    : false

  const labelFontSizeMm = renderSettings
    ? scaleLinearMetric(renderSettings.labelFontSizeMm, levelScale)
    : null

  const labelSurfaceOffsetMm = renderSettings
    ? scaleNonNegativeMetric(renderSettings.labelSurfaceOffsetMm, levelScale)
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
    canonicalOuterRadiusMm: geometry.outerRadiusMm,
    depth: normalizedDepth,
    detailMultiplier,
    fieldSphereRadiusMm: geometry.fieldSphereRadiusMm,
    innerDiameterMm: geometry.innerDiameterMm,
    innerRadiusMm: geometry.innerRadiusMm,
    isLabelVisible,
    labelFontSizeMm,
    labelSurfaceOffsetMm,
    levelScale,
    maxObjectDiameterMm: geometry.maxObjectDiameterMm,
    nestingCoefficient,
    outerDiameterMm: geometry.outerDiameterMm,
    outerRadiusMm: geometry.outerRadiusMm,
    packingDensityCoefficient,
    paddingMm: geometry.paddingMm,
    shellRadiusMm: geometry.shellRadiusMm,
    shellTubeMm: geometry.shellTubeMm,
    sphereDiameterMm: geometry.sphereDiameterMm,
    sphereHeightSegments,
    sphereMaxDiameterMm: geometry.sphereMaxDiameterMm,
    sphereMinDiameterMm: geometry.sphereMinDiameterMm,
    sphereWidthSegments,
    surfaceScale: 1,
    thicknessMm: geometry.thicknessMm,
    torusRadialSegments,
    torusTubularSegments,
    workingThicknessMm: geometry.workingThicknessMm,
  }
}

/** Вычисляет единый набор параметров одного уровня по top-down закону настроек. */
export const resolveAppWebLevelMetrics = ({
  depth,
  layoutSettings,
  outerRadiusMm,
  renderSettings,
  rootOuterDiameterMm = appWebLayoutConfig.snapshot.rootOuterDiameterMm,
}: ResolveAppWebLevelMetricsOptions): AppWebLevelMetrics => {
  const canonicalMetrics = resolveAppWebCanonicalLevelMetrics({
    depth,
    layoutSettings,
    rootOuterDiameterMm,
    ...(renderSettings !== undefined ? { renderSettings } : {}),
  })
  if (outerRadiusMm === undefined) return canonicalMetrics

  const safeOuterRadiusMm = Math.max(0.001, outerRadiusMm)
  const surfaceScale = safeOuterRadiusMm / Math.max(canonicalMetrics.outerRadiusMm, 1e-6)
  return applyAppWebResolvedSurfaceScale(canonicalMetrics, surfaceScale)
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
