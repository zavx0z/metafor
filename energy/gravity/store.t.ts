
/**
 * Типы для @energy/gravity/store.
 *
 * @packageDocumentation
 */

export interface EnergyGravityStore {
  /** Целевая активная id-композиция для следующего/текущего runtime rebuild. */
  activeWimpIds: number[]

  /**
   * Актуальное отображение id -> runtime braneIndex после последнего успешного rebuild.
   *
   * Пока `structuralDirty = true`, это соответствие всё ещё относится к
   * последнему materialized `energy$`, а не к новой целевой composition.
   */
  wimpIdToBraneIndex: Map<number, number>

  /**
   * Актуальное отображение runtime braneIndex -> id после последнего успешного rebuild.
   *
   * Пока `structuralDirty = true`, это соответствие всё ещё относится к
   * последнему materialized `energy$`, а не к новой целевой composition.
   */
  braneIndexToWimpId: number[]

  /**
   * Флаг расхождения composition/addressing слоя и materialized runtime.
   *
   * `true` означает, что composition уже изменилась, но `energy$` ещё не
   * был пересобран из текущего набора id.
   */
  structuralDirty: boolean

  hasWimp(wimpId: number): boolean
  getBraneIndex(wimpId: number): number | undefined
  getWimpId(braneIndex: number): number | undefined
}
