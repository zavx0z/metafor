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
 * - {@link StrongIndexes.placementAddressIndex | placementAddressIndex} — адрес → placement
 * - {@link StrongIndexes.objectPlacementsIndex | objectPlacementsIndex} — object → placements
 * - {@link StrongIndexes.sourceMetaIndex | sourceMetaIndex} — meta → все сущности
 * - {@link StrongIndexes.metaSourceLookup | metaSourceLookup} — source → references
 * - {@link StrongIndexes.entanglementAddressIndex | entanglementAddressIndex} — entanglement address → entanglement
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
 *
 * Используется для сериализации и восстановления индексов:
 * - {@link StrongIndexesSnapshot.placementAddressIndex | placementAddressIndex} — адрес → placement
 * - {@link StrongIndexesSnapshot.entanglementAddressIndex | entanglementAddressIndex} — address → entanglement
 * - {@link StrongIndexesSnapshot.objectPlacementsIndex | objectPlacementsIndex} — object → placements
 * - {@link StrongIndexesSnapshot.sourceMetaIndex | sourceMetaIndex} — meta → сущности
 * - {@link StrongIndexesSnapshot.metaSourceLookup | metaSourceLookup} — source → references
 */
export interface StrongIndexesSnapshot {
  /** Адрес размещения → ID размещения. */
  placementAddressIndex: Map<string, string>

  /** Entanglement address → ID entanglement. */
  entanglementAddressIndex: Map<string, string>

  /** ID объекта → ID размещений. */
  objectPlacementsIndex: Map<string, string[]>

  /** Meta → индексы всех сущностей. */
  sourceMetaIndex: Map<string, GlobalTopologyMetaIndex>

  /** Source → ID references. */
  metaSourceLookup: Map<string, string[]>
}

/**
 * Состояние хранилища `@dark/strong/store`.
 *
 * Хранит индексное промежуточное состояние для cohesion и lookup.
 * Используется в `@dark/strong/strong` для индексации и поиска.
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
 * Возвращает placement и связанный с ним объект:
 * - {@link PlacementLookupResult.placement | placement} — найденное размещение
 * - {@link PlacementLookupResult.object | object} — объект размещения
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
 * Возвращает reference и связанный с ним объект:
 * - {@link ReferenceLookupResult.reference | reference} — найденная ссылка
 * - {@link ReferenceLookupResult.object | object} — объект ссылки
 */
export interface ReferenceLookupResult {
  /** Найденная ссылка. */
  reference: GlobalTopologyReference

  /** Объект, связанный со ссылкой. */
  object: GlobalTopologyObject
}
