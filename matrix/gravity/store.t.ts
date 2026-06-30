
/**
 * Типы для @matrix/gravity/store.
 *
 * @packageDocumentation
 */

export interface MatrixGravityStore {
  /** @deprecated Actor IDs kept only for legacy process result addressing. */
  activeWimpIds: number[]
  /** Целевая активная actor-композиция для следующего/текущего runtime rebuild. */
  activeActorIds: number[]

  /**
   * Актуальное отображение id -> runtime braneIndex после последнего успешного rebuild.
   *
   * Пока `structuralDirty = true`, это соответствие всё ещё относится к
   * последнему materialized `matrix$`, а не к новой целевой composition.
   */
  /** @deprecated Actor ID -> braneIndex map kept only for legacy process result addressing. */
  wimpIdToBraneIndex: Map<number, number>
  actorIdToBraneIndex: Map<number, number>

  /**
   * Актуальное отображение runtime braneIndex -> id после последнего успешного rebuild.
   *
   * Пока `structuralDirty = true`, это соответствие всё ещё относится к
   * последнему materialized `matrix$`, а не к новой целевой composition.
   */
  /** @deprecated braneIndex -> actor ID map kept only for legacy process result addressing. */
  braneIndexToWimpId: number[]
  braneIndexToActorId: number[]
  wimpSrcByActorId: Map<number, string>
  actorIdsByWimpSrc: Map<string, number[]>

  /**
   * Флаг расхождения composition/addressing слоя и materialized runtime.
   *
   * `true` означает, что composition уже изменилась, но `matrix$` ещё не
   * был пересобран из текущего набора id.
   */
  structuralDirty: boolean

  /** @deprecated Legacy process result addressing only. */
  hasWimp(wimpId: number): boolean
  /** @deprecated Legacy process result addressing only. */
  getBraneIndex(wimpId: number): number | undefined
  /** @deprecated Legacy process result addressing only. */
  getWimpId(braneIndex: number): number | undefined
  hasActor(actorId: number): boolean
  getBraneIndexByActorId(actorId: number): number | undefined
  getActorId(braneIndex: number): number | undefined
  getWimpSrcByActorId(actorId: number): string | undefined
  getActorIdsByWimpSrc(wimpSrc: string): number[]
}
