import type { LevelGeometry, LevelGeometrySettings, ResolveLevelGeometryOptions } from "@metafor/types/bulk/level"

const MIN_POSITIVE = 1e-6
const MIN_DIMENSION_MM = 0.001

const normalizeDepth = (depth: number): number =>
  Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 0

/** `2 ** -normalizedDepth` — единый фрактальный закон уменьшения размера вглубь. */
export const resolveLevelScale = (depth: number): number => {
  const normalizedDepth = normalizeDepth(depth)
  return 2 ** -normalizedDepth
}

/**
 * Единый чистый расчёт геометрии уровня.
 *
 * Когда `outerRadiusMm` не задан — возвращает canonical геометрию (по закону `levelScale`).
 * Когда задан — использует его как источник истины и выводит остальные размеры пропорционально
 * без промежуточного `surfaceScale`-шага.
 */
export const resolveLevelGeometry = ({
  depth,
  settings,
  outerRadiusMm,
}: ResolveLevelGeometryOptions): LevelGeometry => {
  const normalizedDepth = normalizeDepth(depth)
  const levelScale = resolveLevelScale(normalizedDepth)

  const canonicalOuterDiameterMm = settings.rootOuterDiameterMm * levelScale
  const outerDiameterMm =
    outerRadiusMm !== undefined
      ? Math.max(MIN_DIMENSION_MM * 2, outerRadiusMm * 2)
      : canonicalOuterDiameterMm
  const outerRadiusMmOut = outerDiameterMm / 2

  const innerOuterRatio = Math.min(
    0.9,
    settings.rootInnerDiameterMm / Math.max(settings.rootOuterDiameterMm, MIN_POSITIVE),
  )
  const innerDiameterMm = outerDiameterMm * innerOuterRatio
  const innerRadiusMm = innerDiameterMm / 2

  const thicknessMm = Math.max(MIN_DIMENSION_MM, (outerDiameterMm - innerDiameterMm) / 2)
  const shellTubeMm = thicknessMm / 2
  const shellRadiusMm = innerRadiusMm + shellTubeMm

  const maxObjectDiameterMm = Math.max(MIN_DIMENSION_MM, outerDiameterMm * settings.nestingCoefficient)
  const sphereMaxDiameterMm = maxObjectDiameterMm
  const sphereMinDiameterMm = maxObjectDiameterMm * settings.sphereMinScaleFactor

  // Диаметр сферы определяется только на root (через rootSphereRadiusMm), вглубь — пропорционально через maxObjectDiameter.
  const rootMaxObjectDiameterMm = settings.rootOuterDiameterMm * settings.nestingCoefficient
  const sphereScaleFactor = Math.min(
    1,
    Math.max(
      settings.sphereMinScaleFactor,
      settings.rootSphereRadiusMm / Math.max(rootMaxObjectDiameterMm, MIN_POSITIVE),
    ),
  )
  const sphereDiameterMm = maxObjectDiameterMm * sphereScaleFactor
  const sphereRadiusMm = sphereDiameterMm / 2

  const paddingMm = Math.max(0, maxObjectDiameterMm * (settings.packingDensityCoefficient - 1))
  const workingThicknessMm = Math.max(MIN_DIMENSION_MM, thicknessMm - paddingMm * 2)

  return {
    depth: normalizedDepth,
    levelScale,
    outerDiameterMm,
    outerRadiusMm: outerRadiusMmOut,
    innerDiameterMm,
    innerRadiusMm,
    shellRadiusMm,
    shellTubeMm,
    thicknessMm,
    workingThicknessMm,
    paddingMm,
    maxObjectDiameterMm,
    sphereDiameterMm,
    sphereRadiusMm,
    sphereMinDiameterMm,
    sphereMaxDiameterMm,
    nestingCoefficient: settings.nestingCoefficient,
    packingDensityCoefficient: settings.packingDensityCoefficient,
  }
}

/** Восстанавливает внешний радиус depth-уровня по радиусу сферы поля того же уровня. */
export const resolveOuterRadiusFromSphereRadius = (
  depth: number,
  settings: LevelGeometrySettings,
  sphereRadiusMm: number,
): number => {
  const safeSphereRadius = Math.max(0, sphereRadiusMm)
  if (safeSphereRadius <= 0) return 0

  const canonical = resolveLevelGeometry({ depth, settings })
  const sphereToOuterRatio =
    canonical.sphereRadiusMm / Math.max(canonical.outerRadiusMm, MIN_POSITIVE)
  if (!(sphereToOuterRatio > MIN_POSITIVE)) return safeSphereRadius
  return safeSphereRadius / sphereToOuterRatio
}
