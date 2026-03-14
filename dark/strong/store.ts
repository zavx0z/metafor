/**
 * `@dark/strong` — graph cohesion и relation retention домена Dark.
 *
 * Ответственность:
 * - индексация placement по адресу и object
 * - индексация reference по source
 * - индексация entanglement по адресу
 * - lookup сущностей по индексам
 * - структурная согласованность индексов
 */

import type {
  GlobalTopologyEntanglement,
  GlobalTopologyMetaIndex,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
} from "../gravity/store.t.ts"
import type { StrongIndexes, StrongIndexesSnapshot, StrongIndexStore } from "./store.t.ts"

function cloneMapValues<T>(source: ReadonlyMap<string, T>): Map<string, T> {
  return new Map(Array.from(source, ([key, value]) => [key, structuredClone(value)]))
}

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

function ensureMetaIndex(indexes: StrongIndexes, meta: string): GlobalTopologyMetaIndex {
  const existing = indexes.sourceMetaIndex.get(meta)
  if (existing) return existing

  const created: GlobalTopologyMetaIndex = {
    objectIds: [],
    placementIds: [],
    referenceIds: [],
    entanglementIds: [],
  }
  indexes.sourceMetaIndex.set(meta, created)
  return created
}

/**
 * Создать хранилище индексов `@dark/strong`.
 */
export function createStrongIndexStore(): StrongIndexStore & StrongIndexes {
  const store: StrongIndexes = {
    placementAddressIndex: new Map(),
    entanglementAddressIndex: new Map(),
    objectPlacementsIndex: new Map(),
    sourceMetaIndex: new Map(),
    metaSourceLookup: new Map(),
  }

  const api: StrongIndexStore = {
    resetIndexes() {
      store.placementAddressIndex.clear()
      store.entanglementAddressIndex.clear()
      store.objectPlacementsIndex.clear()
      store.sourceMetaIndex.clear()
      store.metaSourceLookup.clear()
    },

    restoreIndexes(snapshot: StrongIndexesSnapshot) {
      store.placementAddressIndex.clear()
      store.entanglementAddressIndex.clear()
      store.objectPlacementsIndex.clear()
      store.sourceMetaIndex.clear()
      store.metaSourceLookup.clear()

      for (const [key, value] of snapshot.placementAddressIndex) {
        store.placementAddressIndex.set(key, value)
      }
      for (const [key, value] of snapshot.entanglementAddressIndex) {
        store.entanglementAddressIndex.set(key, value)
      }
      for (const [key, value] of snapshot.objectPlacementsIndex) {
        store.objectPlacementsIndex.set(key, [...value])
      }
      for (const [key, value] of snapshot.sourceMetaIndex) {
        store.sourceMetaIndex.set(key, {
          objectIds: [...value.objectIds],
          placementIds: [...value.placementIds],
          referenceIds: [...value.referenceIds],
          entanglementIds: [...value.entanglementIds],
        })
      }
      for (const [key, value] of snapshot.metaSourceLookup) {
        store.metaSourceLookup.set(key, [...value])
      }
    },

    snapshotIndexes(): StrongIndexesSnapshot {
      return {
        placementAddressIndex: new Map(store.placementAddressIndex),
        entanglementAddressIndex: new Map(store.entanglementAddressIndex),
        objectPlacementsIndex: cloneStringArrayMap(store.objectPlacementsIndex),
        sourceMetaIndex: cloneMetaIndexMap(store.sourceMetaIndex),
        metaSourceLookup: cloneStringArrayMap(store.metaSourceLookup),
      }
    },

    indexPlacement(placement: GlobalTopologyPlacement, meta: string) {
      // Индекс по адресу
      store.placementAddressIndex.set(placement.address, placement.id)

      // Индекс по object
      const objectPlacements = store.objectPlacementsIndex.get(placement.objectId) ?? []
      appendUnique(objectPlacements, placement.id)
      store.objectPlacementsIndex.set(placement.objectId, objectPlacements)

      // Индекс по meta
      const metaIndex = ensureMetaIndex(store, meta)
      appendUnique(metaIndex.placementIds, placement.id)
    },

    removePlacementIndexes(
      placement: GlobalTopologyPlacement,
      objectId: string,
      meta: string,
    ) {
      // Удалить из индекса по адресу
      store.placementAddressIndex.delete(placement.address)

      // Удалить из индекса по object
      const objectPlacements = store.objectPlacementsIndex.get(objectId)
      if (objectPlacements) {
        const filtered = objectPlacements.filter((id) => id !== placement.id)
        if (filtered.length === 0) {
          store.objectPlacementsIndex.delete(objectId)
        } else {
          store.objectPlacementsIndex.set(objectId, filtered)
        }
      }

      // Удалить из индекса по meta
      const metaIndex = store.sourceMetaIndex.get(meta)
      if (metaIndex) {
        metaIndex.placementIds = metaIndex.placementIds.filter((id) => id !== placement.id)
      }
    },

    indexReference(reference: GlobalTopologyReference, meta: string) {
      // Индекс по source
      const bySource = store.metaSourceLookup.get(reference.src) ?? []
      appendUnique(bySource, reference.id)
      store.metaSourceLookup.set(reference.src, bySource)

      // Индекс по meta
      const metaIndex = ensureMetaIndex(store, meta)
      appendUnique(metaIndex.referenceIds, reference.id)
    },

    removeReferenceIndexes(reference: GlobalTopologyReference, meta: string) {
      // Удалить из индекса по source
      const bySource = store.metaSourceLookup.get(reference.src)
      if (bySource) {
        const filtered = bySource.filter((id) => id !== reference.id)
        if (filtered.length === 0) {
          store.metaSourceLookup.delete(reference.src)
        } else {
          store.metaSourceLookup.set(reference.src, filtered)
        }
      }

      // Удалить из индекса по meta
      const metaIndex = store.sourceMetaIndex.get(meta)
      if (metaIndex) {
        metaIndex.referenceIds = metaIndex.referenceIds.filter((id) => id !== reference.id)
      }
    },

    indexEntanglement(entanglement: GlobalTopologyEntanglement, meta: string) {
      // Индекс по entanglement address
      store.entanglementAddressIndex.set(entanglement.entanglementAddress, entanglement.id)

      // Индекс по meta
      const metaIndex = ensureMetaIndex(store, meta)
      appendUnique(metaIndex.entanglementIds, entanglement.id)
    },

    removeEntanglementIndexes(entanglement: GlobalTopologyEntanglement, meta: string) {
      // Удалить из индекса по адресу
      store.entanglementAddressIndex.delete(entanglement.entanglementAddress)

      // Удалить из индекса по meta
      const metaIndex = store.sourceMetaIndex.get(meta)
      if (metaIndex) {
        metaIndex.entanglementIds = metaIndex.entanglementIds.filter((id) => id !== entanglement.id)
      }
    },

    getPlacementByAddress(address: string) {
      // Эта функция только возвращает ID, actual placement берётся извне
      // Возвращаем undefined, так как placement хранится в gravity
      return undefined
    },

    getPlacementsByObject(objectId: string) {
      // Возвращаем пустой массив, actual placements берутся извне
      return []
    },

    getPlacementsByMeta(meta: string) {
      // Возвращаем пустой массив, actual placements берутся извне
      return []
    },

    getReferencesBySource(metaSource: string) {
      // Возвращаем пустой массив, actual references берутся извне
      return []
    },

    getEntanglementByAddress(address: string) {
      // Возвращаем undefined, actual entanglement берётся извне
      return undefined
    },

    isPlacementIndexed(address: string): boolean {
      return store.placementAddressIndex.has(address)
    },

    hasReferenceBySource(metaSource: string, referenceId: string): boolean {
      const bySource = store.metaSourceLookup.get(metaSource)
      return bySource ? bySource.includes(referenceId) : false
    },

    getPlacementIdsByMeta(meta: string): string[] {
      return store.sourceMetaIndex.get(meta)?.placementIds ?? []
    },

    getReferenceIdsBySource(metaSource: string): string[] {
      return store.metaSourceLookup.get(metaSource) ?? []
    },

    getEntanglementIdsByAddress(address: string): string | undefined {
      return store.entanglementAddressIndex.get(address)
    },

    // Прямой доступ к индексам через getters для delegation из topology store
    get placementAddressIndex() {
      return store.placementAddressIndex
    },

    get entanglementAddressIndex() {
      return store.entanglementAddressIndex
    },

    get objectPlacementsIndex() {
      return store.objectPlacementsIndex
    },

    get sourceMetaIndex() {
      return store.sourceMetaIndex
    },

    get metaSourceLookup() {
      return store.metaSourceLookup
    },
  }

  return api
}

/**
 * Синглтон индексов `@dark/strong`.
 */
export const strongIndex$ = createStrongIndexStore()

/**
 * Helper: индексировать object в meta index.
 */
export function indexObject(
  indexes: StrongIndexes,
  objectId: string,
  meta: string,
): void {
  const metaIndex = ensureMetaIndex(indexes, meta)
  appendUnique(metaIndex.objectIds, objectId)
}

/**
 * Helper: удалить object из meta index.
 */
export function removeObjectIndex(
  indexes: StrongIndexes,
  objectId: string,
  meta: string,
): void {
  const metaIndex = indexes.sourceMetaIndex.get(meta)
  if (metaIndex) {
    metaIndex.objectIds = metaIndex.objectIds.filter((id) => id !== objectId)
  }
}

/**
 * Helper: получить placement ID по адресу.
 */
export function getPlacementIdByAddress(
  indexes: StrongIndexes,
  address: string,
): string | undefined {
  return indexes.placementAddressIndex.get(address)
}

/**
 * Helper: получить placement IDs по object.
 */
export function getPlacementIdsByObject(
  indexes: StrongIndexes,
  objectId: string,
): string[] {
  return indexes.objectPlacementsIndex.get(objectId) ?? []
}

/**
 * Helper: получить placement IDs по meta.
 */
export function getPlacementIdsByMeta(
  indexes: StrongIndexes,
  meta: string,
): string[] {
  return indexes.sourceMetaIndex.get(meta)?.placementIds ?? []
}

/**
 * Helper: получить reference IDs по source.
 */
export function getReferenceIdsBySource(
  indexes: StrongIndexes,
  metaSource: string,
): string[] {
  return indexes.metaSourceLookup.get(metaSource) ?? []
}

/**
 * Helper: получить entanglement ID по адресу.
 */
export function getEntanglementIdByAddress(
  indexes: StrongIndexes,
  address: string,
): string | undefined {
  return indexes.entanglementAddressIndex.get(address)
}

/**
 * Helper: индексировать placement.
 */
export function indexPlacement(
  indexes: StrongIndexes,
  placement: GlobalTopologyPlacement,
  meta: string,
): void {
  // Индекс по адресу
  indexes.placementAddressIndex.set(placement.address, placement.id)

  // Индекс по object
  const objectPlacements = indexes.objectPlacementsIndex.get(placement.objectId) ?? []
  appendUnique(objectPlacements, placement.id)
  indexes.objectPlacementsIndex.set(placement.objectId, objectPlacements)

  // Индекс по meta
  const metaIndex = ensureMetaIndex(indexes, meta)
  appendUnique(metaIndex.placementIds, placement.id)
}

/**
 * Helper: индексировать reference.
 */
export function indexReference(
  indexes: StrongIndexes,
  reference: GlobalTopologyReference,
  meta: string,
): void {
  // Индекс по source
  const bySource = indexes.metaSourceLookup.get(reference.src) ?? []
  appendUnique(bySource, reference.id)
  indexes.metaSourceLookup.set(reference.src, bySource)

  // Индекс по meta
  const metaIndex = ensureMetaIndex(indexes, meta)
  appendUnique(metaIndex.referenceIds, reference.id)
}

/**
 * Helper: индексировать entanglement.
 */
export function indexEntanglement(
  indexes: StrongIndexes,
  entanglement: GlobalTopologyEntanglement,
  meta: string,
): void {
  // Индекс по entanglement address
  indexes.entanglementAddressIndex.set(entanglement.entanglementAddress, entanglement.id)

  // Индекс по meta
  const metaIndex = ensureMetaIndex(indexes, meta)
  appendUnique(metaIndex.entanglementIds, entanglement.id)
}
