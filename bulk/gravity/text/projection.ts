import type { BufferGeometry } from "@metafor/engine"

/**
 * Проекция текста на сферу.
 *
 * Текст посажен на параллель с `baseCosLatitude`/`baseSinLatitude`.
 * Ширина развёрнута по долготе на параллели радиуса `radius × baseCosLatitude`,
 * высота развёрнута по широте на окружности полного радиуса `radius`.
 */
export interface SphereProjectionParams {
  kind: "sphere"
  radius: number
  baseCosLatitude: number
  baseSinLatitude: number
}

/**
 * Проекция текста на тор.
 *
 * Ширина идёт по центральной окружности с `centerCircleR = majorRadius + minorRadius × baseCosLatitude`,
 * высота — по малой окружности тубы радиусом `minorRadius`.
 */
export interface TorusProjectionParams {
  kind: "torus"
  majorRadius: number
  minorRadius: number
  baseCosLatitude: number
  baseSinLatitude: number
}

export type SurfaceProjection = SphereProjectionParams | TorusProjectionParams

export interface ProjectSurfaceTextOptions {
  /** Целевая geometry, в которую пишутся новые координаты. */
  geometry: BufferGeometry
  /** Исходные X/Y/Z координаты глифов относительно baseline (y=0) и `centerX`. */
  initialPositions: Float32Array
  /** Горизонтальный якорь в координатах text (обычно centerX из `resolveTextExtents`). */
  centerX: number
  /** Единый масштаб посадки (см. {@link resolveSurfaceFitScale}). */
  scale: number
  projection: SurfaceProjection
}

const markGeometryPositionsDirty = (geometry: BufferGeometry): void => {
  const attribute = geometry.attributes.position
  if (attribute) attribute.needsUpdate = true
}

const getPositionArray = (geometry: BufferGeometry): Float32Array | null => {
  const array = geometry.attributes.position?.array
  return array instanceof Float32Array ? array : null
}

/**
 * Проецирует глиф-геометрию текста на поверхность.
 *
 * Ключевое отличие от прежней реализации:
 * - Baseline берётся как `y = 0` в initial-координатах (typographic anchor),
 *   а не как bbox-центр между ascender и descender. Это сохраняет стабильное
 *   положение базовой линии текста независимо от наличия descender-глифов.
 * - Единый `scale` применяется к X и Y одинаково — пропорции глифов не ломаются.
 * - Верхнеуровневый вызывающий (см. {@link createSurfaceLabel}) уже подобрал `scale`
 *   через {@link resolveSurfaceFitScale} с учётом трёх независимых арк-лимитов.
 */
export const projectSurfaceText = ({
  geometry,
  initialPositions,
  centerX,
  scale,
  projection,
}: ProjectSurfaceTextOptions): void => {
  const positions = getPositionArray(geometry)
  if (!positions || positions.length === 0) return

  if (projection.kind === "sphere") {
    projectOntoSphere(positions, initialPositions, centerX, scale, projection)
  } else {
    projectOntoTorus(positions, initialPositions, centerX, scale, projection)
  }

  markGeometryPositionsDirty(geometry)
}

const projectOntoSphere = (
  positions: Float32Array,
  initialPositions: Float32Array,
  centerX: number,
  scale: number,
  projection: SphereProjectionParams,
): void => {
  const safeRadius = Math.max(projection.radius, 1e-6)
  const baseParallelRadius = Math.max(Math.abs(safeRadius * projection.baseCosLatitude), 1e-6)

  for (let i = 0; i < initialPositions.length; i += 3) {
    const arcOffset = ((initialPositions[i] ?? 0) - centerX) * scale
    const verticalOffset = (initialPositions[i + 1] ?? 0) * scale
    const deltaLongitude = arcOffset / baseParallelRadius
    const deltaLatitude = verticalOffset / safeRadius
    const sinDeltaLongitude = Math.sin(deltaLongitude)
    const cosDeltaLongitude = Math.cos(deltaLongitude)
    const cosDeltaLatitude = Math.cos(deltaLatitude)
    const sinDeltaLatitude = Math.sin(deltaLatitude)
    const cosLat = projection.baseCosLatitude * cosDeltaLatitude - projection.baseSinLatitude * sinDeltaLatitude
    const sinLat = projection.baseSinLatitude * cosDeltaLatitude + projection.baseCosLatitude * sinDeltaLatitude
    const parallelRadius = safeRadius * cosLat
    const radialDelta = parallelRadius * cosDeltaLongitude - safeRadius * projection.baseCosLatitude
    const verticalDelta = safeRadius * sinLat - safeRadius * projection.baseSinLatitude

    positions[i] = parallelRadius * sinDeltaLongitude
    positions[i + 1] = -radialDelta * projection.baseSinLatitude + verticalDelta * projection.baseCosLatitude
    positions[i + 2] = radialDelta * projection.baseCosLatitude + verticalDelta * projection.baseSinLatitude
  }
}

const projectOntoTorus = (
  positions: Float32Array,
  initialPositions: Float32Array,
  centerX: number,
  scale: number,
  projection: TorusProjectionParams,
): void => {
  const safeMajorRadius = Math.max(projection.majorRadius, 1e-6)
  const safeMinorRadius = Math.max(projection.minorRadius, 1e-6)
  const centerCircleRadius = Math.max(safeMajorRadius + safeMinorRadius * projection.baseCosLatitude, 1e-6)
  const safeCenterCircleRadius = Math.max(Math.abs(centerCircleRadius), 1e-6)

  for (let i = 0; i < initialPositions.length; i += 3) {
    const arcOffset = ((initialPositions[i] ?? 0) - centerX) * scale
    const verticalOffset = (initialPositions[i + 1] ?? 0) * scale
    const deltaU = arcOffset / safeCenterCircleRadius
    const deltaV = verticalOffset / safeMinorRadius
    const sinDeltaU = Math.sin(deltaU)
    const cosDeltaU = Math.cos(deltaU)
    const cosDeltaV = Math.cos(deltaV)
    const sinDeltaV = Math.sin(deltaV)
    const cosLat = projection.baseCosLatitude * cosDeltaV - projection.baseSinLatitude * sinDeltaV
    const sinLat = projection.baseSinLatitude * cosDeltaV + projection.baseCosLatitude * sinDeltaV
    const circleRadius = Math.max(safeMajorRadius + safeMinorRadius * cosLat, 1e-6)
    const radialDelta = circleRadius * cosDeltaU - centerCircleRadius
    const verticalDelta = safeMinorRadius * sinLat - safeMinorRadius * projection.baseSinLatitude

    positions[i] = circleRadius * sinDeltaU
    positions[i + 1] = -radialDelta * projection.baseSinLatitude + verticalDelta * projection.baseCosLatitude
    positions[i + 2] = radialDelta * projection.baseCosLatitude + verticalDelta * projection.baseSinLatitude
  }
}
