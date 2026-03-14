import type { GlobalTopologyMetaIndex, GlobalTopologyObject, GlobalTopologyPlacement, GlobalTopologyReference, StrongIndexes, StrongIndexesSnapshot } from "./shared.ts"

/**
 * Состояние хранилища `@dark/strong/store`.
 *
 * Хранит индексное промежуточное состояние для cohesion и lookup.
 */
export interface StrongIndexStore extends StrongIndexes {
  /** Сбрасывает все индексы в начальное состояние. */
  reset(): void

  /**
   * Восстанавливает индексы из снимка.
   * @param snapshot — снимок индексов для восстановления
   */
  restore(snapshot: StrongIndexesSnapshot): void

  /**
   * Создаёт глубокую копию текущих индексов.
   * @returns снимок индексов
   */
  snapshot(): StrongIndexesSnapshot
}

/**
 * Lookup-результат для placement.
 *
 * Возвращает placement и связанный с ним объект.
 */
export interface PlacementLookupResult {
  /** Найденное размещение. */
  placement: GlobalTopologyPlacement

  /** Объект, связанный с размещением. */
  object: GlobalTopologyObject
}

/**
 * Lookup-результат для reference.
 *
 * Возвращает reference и связанный с ним объект.
 */
export interface ReferenceLookupResult {
  /** Найденная ссылка. */
  reference: GlobalTopologyReference

  /** Объект, связанный со ссылкой. */
  object: GlobalTopologyObject
}
