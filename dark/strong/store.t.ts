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

export interface StrongIndexStore extends StrongIndexes {
  reset(): void
  restore(snapshot: StrongIndexesSnapshot): void
  snapshot(): StrongIndexesSnapshot
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
