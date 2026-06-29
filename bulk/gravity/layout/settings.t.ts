/**
 * Bottom-up закон размеров Dark particle hierarchy для materialization в Bulk × Gravity.
 *
 * Эти настройки задают root-размеры manifested-геометрии. Масштаб уровней задаёт
 * минимальный canonical-размер в `@bulk/gravity/level`; фактическая torus geometry
 * может расшириться, если вложенным Dark particles и field particles нужно больше места.
 */
export interface BulkLayoutSettings {
  /** Расстояние между краями объектов на орбитах в миллиметрах. `0` = почти касание. */
  orbitEdgeGapMm: number
  /** Внутренний диаметр root-тора в миллиметрах. То же отношение переносится на внутренние уровни. */
  rootInnerDiameterMm: number
  /** Радиус sphere geometry для field particles на root-уровне в миллиметрах в пределах level-contract. */
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
