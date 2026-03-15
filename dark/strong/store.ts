import type {
  GlobalTopologyEntanglement,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
  StrongIndexesSnapshot,
} from "@dark/types"
import type { DarkStrongStore } from "@dark/types/strong"
import { cloneStrongSnapshot } from "./snapshot.ts"

export const strong$: DarkStrongStore = {
  placementAddressIndex: new Map(),
  entanglementAddressIndex: new Map(),
  objectPlacementsIndex: new Map(),
  sourceMetaIndex: new Map(),
  metaSourceLookup: new Map(),

  reset() {
    this.placementAddressIndex = new Map()
    this.entanglementAddressIndex = new Map()
    this.objectPlacementsIndex = new Map()
    this.sourceMetaIndex = new Map()
    this.metaSourceLookup = new Map()
  },

  restore(snapshot: StrongIndexesSnapshot) {
    const next = cloneStrongSnapshot(snapshot)
    this.placementAddressIndex = next.placementAddressIndex
    this.entanglementAddressIndex = next.entanglementAddressIndex
    this.objectPlacementsIndex = next.objectPlacementsIndex
    this.sourceMetaIndex = next.sourceMetaIndex
    this.metaSourceLookup = next.metaSourceLookup
  },

  snapshot() {
    return cloneStrongSnapshot(this)
  },

  /**
   * Находит ID placement по адресу.
   */
  getPlacementIdByAddress(address: string): string | undefined {
    return this.placementAddressIndex.get(address)
  },

  /**
   * Находит IDs placements объекта.
   */
  getPlacementIdsByObject(objectId: string): string[] {
    return this.objectPlacementsIndex.get(objectId) ?? []
  },

  /**
   * Находит IDs placements meta-схемы.
   */
  getPlacementIdsByMeta(meta: string): string[] {
    return this.sourceMetaIndex.get(meta)?.placementIds ?? []
  },

  /**
   * Находит IDs references по источнику.
   */
  getReferenceIdsBySource(src: string): string[] {
    return this.metaSourceLookup.get(src) ?? []
  },

  /**
   * Проверяет наличие reference по source и ID.
   */
  hasReferenceBySource(src: string, referenceId: string): boolean {
    return this.metaSourceLookup.get(src)?.includes(referenceId) ?? false
  },

  /**
   * Проверяет что placement индексирован.
   */
  isPlacementIndexed(address: string): boolean {
    return this.placementAddressIndex.has(address)
  },

  /**
   * Находит ID entanglement по адресу.
   */
  getEntanglementIdByAddress(address: string): string | undefined {
    return this.entanglementAddressIndex.get(address)
  },

  /**
   * Удаляет индексы placement.
   */
  removePlacementIndexes(
    placement: GlobalTopologyPlacement,
    objectId: string,
    meta: string,
  ): void {
    this.placementAddressIndex.delete(placement.address)
    const objectPlacements = this.objectPlacementsIndex.get(objectId)
    if (objectPlacements) {
      const filtered = objectPlacements.filter((id: string) => id !== placement.id)
      if (filtered.length === 0) {
        this.objectPlacementsIndex.delete(objectId)
      } else {
        this.objectPlacementsIndex.set(objectId, filtered)
      }
    }
    const metaIndex = this.sourceMetaIndex.get(meta)
    if (metaIndex) {
      metaIndex.placementIds = metaIndex.placementIds.filter((id: string) => id !== placement.id)
    }
  },

  /**
   * Удаляет индексы reference.
   */
  removeReferenceIndexes(reference: GlobalTopologyReference, meta: string): void {
    const bySource = this.metaSourceLookup.get(reference.src)
    if (bySource) {
      const filtered = bySource.filter((id: string) => id !== reference.id)
      if (filtered.length === 0) {
        this.metaSourceLookup.delete(reference.src)
      } else {
        this.metaSourceLookup.set(reference.src, filtered)
      }
    }
    const metaIndex = this.sourceMetaIndex.get(meta)
    if (metaIndex) {
      metaIndex.referenceIds = metaIndex.referenceIds.filter((id: string) => id !== reference.id)
    }
  },

  /**
   * Удаляет индексы entanglement.
   */
  removeEntanglementIndexes(entanglement: GlobalTopologyEntanglement, meta: string): void {
    this.entanglementAddressIndex.delete(entanglement.entanglementAddress)
    const metaIndex = this.sourceMetaIndex.get(meta)
    if (metaIndex) {
      metaIndex.entanglementIds = metaIndex.entanglementIds.filter((id: string) => id !== entanglement.id)
    }
  },
}
