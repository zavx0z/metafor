import type { GlobalTopologyEntanglement, GlobalTopologyMetaIndex, GlobalTopologyObject, GlobalTopologyPlacement, GlobalTopologyReference, StrongIndexes, StrongIndexesSnapshot } from "./shared.ts"

// Re-export shared types used by strong
export type { GlobalTopologyMetaIndex, StrongIndexes, StrongIndexesSnapshot }

/**
 * Состояние хранилища `@dark/strong/store`.
 *
 * Хранит индексное промежуточное состояние для cohesion и lookup.
 */
export interface DarkStrongStore extends StrongIndexes {
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

  /**
   * Находит ID placement по адресу.
   */
  getPlacementIdByAddress(address: string): string | undefined

  /**
   * Находит IDs placements объекта.
   */
  getPlacementIdsByObject(objectId: string): string[]

  /**
   * Находит IDs placements meta-схемы.
   */
  getPlacementIdsByMeta(meta: string): string[]

  /**
   * Находит IDs references по источнику.
   */
  getReferenceIdsBySource(src: string): string[]

  /**
   * Проверяет наличие reference по source и ID.
   */
  hasReferenceBySource(src: string, referenceId: string): boolean

  /**
   * Проверяет что placement индексирован.
   */
  isPlacementIndexed(address: string): boolean

  /**
   * Находит ID entanglement по адресу.
   */
  getEntanglementIdByAddress(address: string): string | undefined

  /**
   * Удаляет индексы placement.
   */
  removePlacementIndexes(placement: GlobalTopologyPlacement, objectId: string, meta: string): void

  /**
   * Удаляет индексы reference.
   */
  removeReferenceIndexes(reference: GlobalTopologyReference, meta: string): void

  /**
   * Удаляет индексы entanglement.
   */
  removeEntanglementIndexes(entanglement: GlobalTopologyEntanglement, meta: string): void
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
