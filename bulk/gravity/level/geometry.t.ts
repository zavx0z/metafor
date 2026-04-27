import type { LevelGeometrySettings } from "./settings.t"

/**
 * Геометрия одного уровня бран.
 *
 * Чистый набор размеров в миллиметрах без смешения с render/label параметрами.
 * Все значения следуют единому `levelScale`-закону: либо из канонического снижения по глубине,
 * либо из фактического `outerRadiusMm` снимка (без двойного masштабирования через `surfaceScale`).
 */
export interface LevelGeometry {
  depth: number
  /** `1 / pow(levelSizeMultiplier, depth)` — масштаб канонического размера относительно корня. */
  levelScale: number
  outerDiameterMm: number
  outerRadiusMm: number
  innerDiameterMm: number
  innerRadiusMm: number
  /** Центральный радиус кольца шелла (центр тубы). */
  shellRadiusMm: number
  /** Радиус тубы шелла. */
  shellTubeMm: number
  /** Толщина кольца тора = `outerR − innerR`. */
  thicknessMm: number
  /** Эффективная толщина с учётом `padding`. */
  workingThicknessMm: number
  /** Padding между объектами при упаковке. */
  paddingMm: number
  /** Максимальный диаметр объекта, помещающегося внутри. */
  maxObjectDiameterMm: number
  sphereDiameterMm: number
  sphereRadiusMm: number
  sphereMinDiameterMm: number
  sphereMaxDiameterMm: number
  nestingCoefficient: number
  packingDensityCoefficient: number
}

/**
 * Опции расчёта геометрии уровня.
 *
 * Если `outerRadiusMm` не задан — возвращается канонический расчёт из `settings`.
 * Если задан — геометрия подгоняется под фактический радиус снимка (пропорционально).
 */
export interface ResolveLevelGeometryOptions {
  depth: number
  settings: LevelGeometrySettings
  outerRadiusMm?: number
}
