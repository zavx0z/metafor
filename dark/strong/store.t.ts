/**
 * Индекс сущностей по meta-схеме.
 *
 * Хранит IDs всех сущностей, принадлежащих meta-схеме:
 * - `objectIds` — объекты
 * - `placementIds` — размещения
 * - `referenceIds` — ссылки
 * - `entanglementIds` — запутанности
 */
export interface GlobalTopologyMetaIndex {
  /** IDs объектов из meta-схемы. */
  objectIds: string[]

  /** IDs размещений из meta-схемы. */
  placementIds: string[]

  /** IDs ссылок из meta-схемы. */
  referenceIds: string[]

  /** IDs запутанностей из meta-схемы. */
  entanglementIds: string[]
}

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
 *
 * Используется для сериализации и восстановления индексов:
 * - `placementAddressIndex` — адрес → placement
 * - `entanglementAddressIndex` — address → entanglement
 * - `objectPlacementsIndex` — object → placements
 * - `sourceMetaIndex` — meta → сущности
 * - `metaSourceLookup` — source → references
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
 * - `placement` — найденное размещение
 * - `object` — объект размещения
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
 * - `reference` — найденная ссылка
 * - `object` — объект ссылки
 */
export interface ReferenceLookupResult {
  /** Найденная ссылка. */
  reference: GlobalTopologyReference

  /** Объект, связанный со ссылкой. */
  object: GlobalTopologyObject
}
