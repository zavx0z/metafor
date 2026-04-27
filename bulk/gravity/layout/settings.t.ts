/**
 * Top-down закон размеров shell-иерархии для materialization в Bulk × Gravity.
 *
 * Эти настройки задают общий каркас manifested-геометрии: как уменьшаются shell-ы
 * от root-уровня вглубь, какой размер у root-тора и его peer-сферы.
 */
export interface BulkLayoutSettings {
  /** Коэффициент уменьшения canonical shell size от root-уровня вглубь. Должен быть `> 0`. */
  levelSizeMultiplier: number
  /** Внутренний диаметр root-тора в миллиметрах. То же отношение переносится на внутренние уровни. */
  rootInnerDiameterMm: number
  /** Диаметр peer-sphere на root-уровне в миллиметрах в пределах level-contract. */
  rootSphereRadiusMm: number
}

/**
 * Нередактируемый snapshot-контракт Bulk × Gravity.
 *
 * Базовые константы layout-задачи — целевой внешний диаметр root, плотность упаковки,
 * нижний предел сферы поля. Не предполагается изменение пользователем; это формула.
 */
export interface BulkLayoutSnapshotConfig {
  deepestFieldSphereRadiusMm: number
  nestingCoefficient: number
  packingDensityCoefficient: number
  rootOuterDiameterMm: number
  sphereMinScaleFactor: number
}
