/**
 * `@dark/strong` — graph cohesion и relation retention домена Dark.
 *
 * Ответственность:
 * - индексация placement по адресу и object
 * - индексация reference по source
 * - индексация entanglement по адресу
 * - lookup сущностей по индексам
 * - структурная согласованность индексов
 *
 * @see {@link strong$} — явный object store
 */

import type {
  GlobalTopologyEntanglement,
  GlobalTopologyMetaIndex,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
} from "../gravity/store.t.ts"
import type { StrongIndexesSnapshot } from "./store.t.ts"

function cloneStringArrayMap(source: ReadonlyMap<string, string[]>): Map<string, string[]> {
  return new Map(Array.from(source, ([key, value]) => [key, [...value]]))
}

function cloneMetaIndexMap(source: ReadonlyMap<string, GlobalTopologyMetaIndex>): Map<string, GlobalTopologyMetaIndex> {
  return new Map(
    Array.from(source, ([key, value]) => [
      key,
      {
        objectIds: [...value.objectIds],
        placementIds: [...value.placementIds],
        referenceIds: [...value.referenceIds],
        entanglementIds: [...value.entanglementIds],
      },
    ]),
  )
}

function appendUnique(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value)
}

function ensureMetaIndex(meta: string): GlobalTopologyMetaIndex {
  const existing = strong$.sourceMetaIndex.get(meta)
  if (existing) return existing

  const created: GlobalTopologyMetaIndex = {
    objectIds: [],
    placementIds: [],
    referenceIds: [],
    entanglementIds: [],
  }
  strong$.sourceMetaIndex.set(meta, created)
  return created
}

/**
 * Явный object store `@dark/strong`.
 *
 * Источник истины для индексов и cohesion.
 */
export const strong$ = {
  /** Адрес размещения → ID размещения. */
  placementAddressIndex: new Map<string, string>(),

  /** ID объекта → ID размещений. */
  objectPlacementsIndex: new Map<string, string[]>(),

  /** Meta → индексы всех сущностей. */
  sourceMetaIndex: new Map<string, GlobalTopologyMetaIndex>(),

  /** Source → ID references. */
  metaSourceLookup: new Map<string, string[]>(),

  /** Entanglement address → ID entanglement. */
  entanglementAddressIndex: new Map<string, string>(),

  /** Сброс всех индексов. */
  resetIndexes() {
    this.placementAddressIndex.clear()
    this.entanglementAddressIndex.clear()
    this.objectPlacementsIndex.clear()
    this.sourceMetaIndex.clear()
    this.metaSourceLookup.clear()
  },

  /** Восстановление индексов из снимка. */
  restoreIndexes(snapshot: StrongIndexesSnapshot) {
    this.placementAddressIndex.clear()
    this.entanglementAddressIndex.clear()
    this.objectPlacementsIndex.clear()
    this.sourceMetaIndex.clear()
    this.metaSourceLookup.clear()

    for (const [key, value] of snapshot.placementAddressIndex) {
      this.placementAddressIndex.set(key, value)
    }
    for (const [key, value] of snapshot.entanglementAddressIndex) {
      this.entanglementAddressIndex.set(key, value)
    }
    for (const [key, value] of snapshot.objectPlacementsIndex) {
      this.objectPlacementsIndex.set(key, [...value])
    }
    for (const [key, value] of snapshot.sourceMetaIndex) {
      this.sourceMetaIndex.set(key, {
        objectIds: [...value.objectIds],
        placementIds: [...value.placementIds],
        referenceIds: [...value.referenceIds],
        entanglementIds: [...value.entanglementIds],
      })
    }
    for (const [key, value] of snapshot.metaSourceLookup) {
      this.metaSourceLookup.set(key, [...value])
    }
  },

  /** Снимок индексов. */
  snapshotIndexes(): StrongIndexesSnapshot {
    return {
      placementAddressIndex: new Map(this.placementAddressIndex),
      entanglementAddressIndex: new Map(this.entanglementAddressIndex),
      objectPlacementsIndex: cloneStringArrayMap(this.objectPlacementsIndex),
      sourceMetaIndex: cloneMetaIndexMap(this.sourceMetaIndex),
      metaSourceLookup: cloneStringArrayMap(this.metaSourceLookup),
    }
  },

  /** Индексировать placement. */
  indexPlacement(placement: GlobalTopologyPlacement, meta: string) {
    // Индекс по адресу
    this.placementAddressIndex.set(placement.address, placement.id)

    // Индекс по object
    const objectPlacements = this.objectPlacementsIndex.get(placement.objectId) ?? []
    appendUnique(objectPlacements, placement.id)
    this.objectPlacementsIndex.set(placement.objectId, objectPlacements)

    // Индекс по meta
    const metaIndex = ensureMetaIndex(meta)
    appendUnique(metaIndex.placementIds, placement.id)
  },

  /** Удалить placement из индексов. */
  removePlacementIndexes(
    placement: GlobalTopologyPlacement,
    objectId: string,
    meta: string,
  ) {
    // Удалить из индекса по адресу
    this.placementAddressIndex.delete(placement.address)

    // Удалить из индекса по object
    const objectPlacements = this.objectPlacementsIndex.get(objectId)
    if (objectPlacements) {
      const filtered = objectPlacements.filter((id) => id !== placement.id)
      if (filtered.length === 0) {
        this.objectPlacementsIndex.delete(objectId)
      } else {
        this.objectPlacementsIndex.set(objectId, filtered)
      }
    }

    // Удалить из индекса по meta
    const metaIndex = this.sourceMetaIndex.get(meta)
    if (metaIndex) {
      metaIndex.placementIds = metaIndex.placementIds.filter((id) => id !== placement.id)
    }
  },

  /** Индексировать reference. */
  indexReference(reference: GlobalTopologyReference, meta: string) {
    // Индекс по source
    const bySource = this.metaSourceLookup.get(reference.src) ?? []
    appendUnique(bySource, reference.id)
    this.metaSourceLookup.set(reference.src, bySource)

    // Индекс по meta
    const metaIndex = ensureMetaIndex(meta)
    appendUnique(metaIndex.referenceIds, reference.id)
  },

  /** Удалить reference из индексов. */
  removeReferenceIndexes(reference: GlobalTopologyReference, meta: string) {
    // Удалить из индекса по source
    const bySource = this.metaSourceLookup.get(reference.src)
    if (bySource) {
      const filtered = bySource.filter((id) => id !== reference.id)
      if (filtered.length === 0) {
        this.metaSourceLookup.delete(reference.src)
      } else {
        this.metaSourceLookup.set(reference.src, filtered)
      }
    }

    // Удалить из индекса по meta
    const metaIndex = this.sourceMetaIndex.get(meta)
    if (metaIndex) {
      metaIndex.referenceIds = metaIndex.referenceIds.filter((id) => id !== reference.id)
    }
  },

  /** Индексировать entanglement. */
  indexEntanglement(entanglement: GlobalTopologyEntanglement, meta: string) {
    // Индекс по entanglement address
    this.entanglementAddressIndex.set(entanglement.entanglementAddress, entanglement.id)

    // Индекс по meta
    const metaIndex = ensureMetaIndex(meta)
    appendUnique(metaIndex.entanglementIds, entanglement.id)
  },

  /** Удалить entanglement из индексов. */
  removeEntanglementIndexes(entanglement: GlobalTopologyEntanglement, meta: string) {
    // Удалить из индекса по адресу
    this.entanglementAddressIndex.delete(entanglement.entanglementAddress)

    // Удалить из индекса по meta
    const metaIndex = this.sourceMetaIndex.get(meta)
    if (metaIndex) {
      metaIndex.entanglementIds = metaIndex.entanglementIds.filter((id) => id !== entanglement.id)
    }
  },

  /** Индексировать object в meta index. */
  indexObject(objectId: string, meta: string) {
    const metaIndex = ensureMetaIndex(meta)
    appendUnique(metaIndex.objectIds, objectId)
  },

  /** Удалить object из meta index. */
  removeObjectIndex(objectId: string, meta: string) {
    const metaIndex = this.sourceMetaIndex.get(meta)
    if (metaIndex) {
      metaIndex.objectIds = metaIndex.objectIds.filter((id) => id !== objectId)
    }
  },

  /** Получить placement IDs по meta. */
  getPlacementIdsByMeta(meta: string): string[] {
    return this.sourceMetaIndex.get(meta)?.placementIds ?? []
  },

  /** Получить reference IDs по source. */
  getReferenceIdsBySource(metaSource: string): string[] {
    return this.metaSourceLookup.get(metaSource) ?? []
  },

  /** Получить entanglement ID по адресу. */
  getEntanglementIdsByAddress(address: string): string | undefined {
    return this.entanglementAddressIndex.get(address)
  },

  /** Проверить что placement ещё не индексирован. */
  isPlacementIndexed(address: string): boolean {
    return this.placementAddressIndex.has(address)
  },

  /** Проверить что reference уже индексирован по source. */
  hasReferenceBySource(metaSource: string, referenceId: string): boolean {
    const bySource = this.metaSourceLookup.get(metaSource)
    return bySource ? bySource.includes(referenceId) : false
  },
}

/**
 * Helper: получить placement ID по адресу.
 */
export function getPlacementIdByAddress(
  address: string,
): string | undefined {
  return strong$.placementAddressIndex.get(address)
}

/**
 * Helper: получить placement IDs по object.
 */
export function getPlacementIdsByObject(
  objectId: string,
): string[] {
  return strong$.objectPlacementsIndex.get(objectId) ?? []
}

/**
 * Helper: получить placement IDs по meta.
 */
export function getPlacementIdsByMeta(
  meta: string,
): string[] {
  return strong$.sourceMetaIndex.get(meta)?.placementIds ?? []
}

/**
 * Helper: получить reference IDs по source.
 */
export function getReferenceIdsBySource(
  metaSource: string,
): string[] {
  return strong$.metaSourceLookup.get(metaSource) ?? []
}

/**
 * Helper: получить entanglement ID по адресу.
 */
export function getEntanglementIdByAddress(
  address: string,
): string | undefined {
  return strong$.entanglementAddressIndex.get(address)
}

/**
 * Helper: индексировать placement (standalone function для тестов).
 */
export function indexPlacement(
  placement: GlobalTopologyPlacement,
  meta: string,
): void {
  strong$.indexPlacement(placement, meta)
}
