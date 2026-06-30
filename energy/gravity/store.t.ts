
/**
 * Типы для @energy/gravity/store.
 *
 * @packageDocumentation
 */

export interface EnergyGravityStore {
  /** Целевая активная id-композиция для следующего/текущего runtime rebuild. */
  activeWimpIds: number[]
  activeActorIds: number[]

  /**
   * Актуальное отображение id -> runtime braneIndex после последнего успешного rebuild.
   *
   * Пока `structuralDirty = true`, это соответствие всё ещё относится к
   * последнему materialized `energy$`, а не к новой целевой composition.
   */
  wimpIdToBraneIndex: Map<number, number>
  actorIdToBraneIndex: Map<number, number>

  /**
   * Актуальное отображение runtime braneIndex -> id после последнего успешного rebuild.
   *
   * Пока `structuralDirty = true`, это соответствие всё ещё относится к
   * последнему materialized `energy$`, а не к новой целевой composition.
   */
  braneIndexToWimpId: number[]
  braneIndexToActorId: number[]
  wimpSrcByActorId: Map<number, string>
  actorIdsByWimpSrc: Map<string, number[]>

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
  hasActor(actorId: number): boolean
  getBraneIndexByActorId(actorId: number): number | undefined
  getActorId(braneIndex: number): number | undefined
  getWimpSrcByActorId(actorId: number): string | undefined
  getActorIdsByWimpSrc(wimpSrc: string): number[]
}
