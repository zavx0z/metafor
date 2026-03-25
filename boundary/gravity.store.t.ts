/** Типы для `@boundary/boundary/gravity.store`. */

export interface BoundaryGravityStore {
  /** Целевая активная UUID-композиция для следующего/текущего runtime rebuild. */
  activeWimpIds: string[]

  /**
   * Актуальное отображение UUID -> runtime braneIndex после последнего успешного rebuild.
   *
   * Пока `structuralDirty = true`, это соответствие всё ещё относится к
   * последнему materialized `boundary$`, а не к новой целевой composition.
   */
  wimpIdToBraneIndex: Map<string, number>

  /**
   * Актуальное отображение runtime braneIndex -> UUID после последнего успешного rebuild.
   *
   * Пока `structuralDirty = true`, это соответствие всё ещё относится к
   * последнему materialized `boundary$`, а не к новой целевой composition.
   */
  braneIndexToWimpId: string[]

  /**
   * Флаг расхождения composition/addressing слоя и materialized runtime.
   *
   * `true` означает, что composition уже изменилась, но `boundary$` ещё не
   * был пересобран из текущего набора UUID.
   */
  structuralDirty: boolean

  hasWimp(wimpId: string): boolean
  getBraneIndex(wimpId: string): number | undefined
  getWimpId(braneIndex: number): string | undefined
}
