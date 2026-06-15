/**
 * Bottom-up закон размеров shell-иерархии для materialization в Bulk × Gravity.
 *
 * Эти настройки задают root-размеры manifested-геометрии. Масштаб уровней задаёт
 * минимальный canonical-размер в `@bulk/gravity/level`; фактический shell может
 * расшириться, если вложенные торы и сферы требуют больше места.
 */
export interface BulkLayoutSettings {
  /** Расстояние между краями объектов на орбитах в миллиметрах. `0` = почти касание. */
  orbitEdgeGapMm: number
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
