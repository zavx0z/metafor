import type {
  GlobalTopologyEntanglement,
  GlobalTopologyMetaIndex,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
} from "../gravity/store.t.ts"

/**
 * Индексы `@dark/strong` для cohesion и lookup.
 *
 * Хранит структурную непрерывность скрытого графа:
 * - `placementAddressIndex` — адрес → placement
 * - `objectPlacementsIndex` — object → placements
 * - `sourceMetaIndex` — meta → все сущности
 * - `metaSourceLookup` — source → references
 * - `entanglementAddressIndex` — entanglement address → entanglement
 */
export interface StrongIndexes {
  /** Адрес размещения → ID размещения. */
  placementAddressIndex: Map<string, string>

  /** ID объекта → ID размещений. */
  objectPlacementsIndex: Map<string, string[]>

  /** Meta → индексы всех сущностей. */
  sourceMetaIndex: Map<string, GlobalTopologyMetaIndex>

  /** Source → ID references. */
  metaSourceLookup: Map<string, string[]>

  /** Entanglement address → ID entanglement. */
  entanglementAddressIndex: Map<string, string>
}

/**
 * Снимок индексов `@dark/strong`.
 */
export interface StrongIndexesSnapshot {
  placementAddressIndex: Map<string, string>
  entanglementAddressIndex: Map<string, string>
  objectPlacementsIndex: Map<string, string[]>
  sourceMetaIndex: Map<string, GlobalTopologyMetaIndex>
  metaSourceLookup: Map<string, string[]>
}

/**
 * Контракты индексации `@dark/strong`.
 *
 * Ответственность:
 * - добавление placement в индексы
 * - удаление placement из индексов
 * - lookup по адресу, object, meta, source
 */
export interface StrongIndexStore extends StrongIndexes {
  /** Сброс всех индексов. */
  resetIndexes(): void

  /** Восстановление индексов из снимка. */
  restoreIndexes(snapshot: StrongIndexesSnapshot): void

  /** Снимок индексов. */
  snapshotIndexes(): StrongIndexesSnapshot

  /** Индексировать placement. */
  indexPlacement(placement: GlobalTopologyPlacement, meta: string): void

  /** Удалить placement из индексов. */
  removePlacementIndexes(
    placement: GlobalTopologyPlacement,
    objectId: string,
    meta: string,
  ): void

  /** Индексировать reference. */
  indexReference(reference: GlobalTopologyReference, meta: string): void

  /** Удалить reference из индексов. */
  removeReferenceIndexes(reference: GlobalTopologyReference, meta: string): void

  /** Индексировать entanglement. */
  indexEntanglement(entanglement: GlobalTopologyEntanglement, meta: string): void

  /** Удалить entanglement из индексов. */
  removeEntanglementIndexes(entanglement: GlobalTopologyEntanglement, meta: string): void

  /** Получить placement по адресу. */
  getPlacementByAddress(address: string): GlobalTopologyPlacement | undefined

  /** Получить placements по object ID. */
  getPlacementsByObject(objectId: string): GlobalTopologyPlacement[]

  /** Получить placements по meta. */
  getPlacementsByMeta(meta: string): GlobalTopologyPlacement[]

  /** Получить references по source. */
  getReferencesBySource(metaSource: string): GlobalTopologyReference[]

  /** Получить entanglement по адресу. */
  getEntanglementByAddress(address: string): GlobalTopologyEntanglement | undefined

  /** Проверить что placement ещё не индексирован. */
  isPlacementIndexed(address: string): boolean

  /** Проверить что reference уже индексирован по source. */
  hasReferenceBySource(metaSource: string, referenceId: string): boolean

  /** Получить placement IDs по meta. */
  getPlacementIdsByMeta(meta: string): string[]

  /** Получить reference IDs по source. */
  getReferenceIdsBySource(metaSource: string): string[]

  /** Получить entanglement IDs по адресу. */
  getEntanglementIdsByAddress(address: string): string | undefined
}

/**
 * Lookup-результат для placement.
 */
export interface PlacementLookupResult {
  placement: GlobalTopologyPlacement
  object: GlobalTopologyObject
}

/**
 * Lookup-результат для reference.
 */
export interface ReferenceLookupResult {
  reference: GlobalTopologyReference
  object: GlobalTopologyObject
}
