/**
 * Настройки закона уровней Bulk × Gravity.
 *
 * Разделены на три независимых слоя:
 * - `LevelGeometrySettings` — геометрическая иерархия (размеры бран по глубине)
 * - `LevelDetailSettings` — плотность wireframe-детализации
 * - `LevelLabelSettings` — видимость и масштаб подписей по уровням
 */

/** Закон геометрической иерархии: размеры бран при заданной глубине. */
export interface LevelGeometrySettings {
  /** Внутренний диаметр корневого тора в мм. */
  rootInnerDiameterMm: number
  /** Радиус сферы поля на корневом уровне в мм. */
  rootSphereRadiusMm: number
  /** Внешний диаметр корневого тора в мм (обычно фиксированный snapshot-константой). */
  rootOuterDiameterMm: number
  /** Коэффициент вложенности: `maxObjectDiameter / outerDiameter`. */
  nestingCoefficient: number
  /** Коэффициент плотности упаковки: `1` = вплотную, `>1` — с gap. */
  packingDensityCoefficient: number
  /** Минимальный масштаб сферы относительно `maxObjectDiameter`. */
  sphereMinScaleFactor: number
}

/** Закон детализации wireframe-геометрии по уровням. */
export interface LevelDetailSettings {
  /** Плотность детализации у корневого уровня (`1` = базовая). */
  detailDensityFactor: number
  /** Коэффициент ослабления детализации на каждый уровень. `> 0`. */
  detailLevelMultiplier: number
  /** Базовое количество колец тора. */
  torusRadialSegments: number
  /** Базовая сглаженность одного кольца тора. */
  torusTubularSegments: number
  /** Верхний предел сегментов тора. */
  torusMaxSegments: number
  /** Базовая ширина сегментации сферы. */
  sphereBaseWidthSegments: number
  /** Базовая высота сегментации сферы. */
  sphereBaseHeightSegments: number
  /** Верхний предел ширины сегментации сферы. */
  sphereMaxWidthSegments: number
  /** Верхний предел высоты сегментации сферы. */
  sphereMaxHeightSegments: number
}

/** Закон видимости и масштабирования подписей по уровням. */
export interface LevelLabelSettings {
  /** Текущий базовый уровень viewport (`0` = root, `-1` = все уровни). */
  baseDepth: number
  /** Размер шрифта подписи на корневом уровне в мм. */
  fontSizeMm: number
  /** Отступ подписи от поверхности на корневом уровне в мм. */
  surfaceOffsetMm: number
  /** Сколько уровней вглубь от `baseDepth` показывать подписи. */
  visibleLevels: number
}

/** Составной контракт настроек уровней для фасада. */
export interface LevelSettings {
  geometry: LevelGeometrySettings
  detail: LevelDetailSettings
  label: LevelLabelSettings
}
