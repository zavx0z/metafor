/**
 * `@dark/strong` — index orchestration и lookup поверх `strong$`.
 */

import type {
  GlobalTopologyEntanglement,
  GlobalTopologyMetaIndex,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
} from "../gravity/store.t.ts"
import type { StrongIndexes } from "./store.t.ts"
import { strong$ } from "./store.ts"

function appendUnique(target: string[], value: string): string[] {
  return target.includes(value) ? target : [...target, value]
}

function ensureMetaIndex(store$: StrongIndexes, meta: string): GlobalTopologyMetaIndex {
  const existing = store$.sourceMetaIndex.get(meta)
  if (existing) return existing

  const created: GlobalTopologyMetaIndex = {
    objectIds: [],
    placementIds: [],
    referenceIds: [],
    entanglementIds: [],
  }
  store$.sourceMetaIndex.set(meta, created)
  return created
}

export function indexPlacement(
  placement: GlobalTopologyPlacement,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  store$.placementAddressIndex.set(placement.address, placement.id)
  store$.objectPlacementsIndex.set(
    placement.objectId,
    appendUnique(store$.objectPlacementsIndex.get(placement.objectId) ?? [], placement.id),
  )

  const metaIndex = ensureMetaIndex(store$, meta)
  metaIndex.placementIds = appendUnique(metaIndex.placementIds, placement.id)
}

export function removePlacementIndexes(
  placement: GlobalTopologyPlacement,
  objectId: string,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  store$.placementAddressIndex.delete(placement.address)

  const objectPlacements = store$.objectPlacementsIndex.get(objectId)
  if (objectPlacements) {
    const filtered = objectPlacements.filter((id) => id !== placement.id)
    if (filtered.length === 0) {
      store$.objectPlacementsIndex.delete(objectId)
    } else {
      store$.objectPlacementsIndex.set(objectId, filtered)
    }
  }

  const metaIndex = store$.sourceMetaIndex.get(meta)
  if (metaIndex) {
    metaIndex.placementIds = metaIndex.placementIds.filter((id) => id !== placement.id)
  }
}

export function indexReference(
  reference: GlobalTopologyReference,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  store$.metaSourceLookup.set(
    reference.src,
    appendUnique(store$.metaSourceLookup.get(reference.src) ?? [], reference.id),
  )

  const metaIndex = ensureMetaIndex(store$, meta)
  metaIndex.referenceIds = appendUnique(metaIndex.referenceIds, reference.id)
}

export function removeReferenceIndexes(
  reference: GlobalTopologyReference,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  const bySource = store$.metaSourceLookup.get(reference.src)
  if (bySource) {
    const filtered = bySource.filter((id) => id !== reference.id)
    if (filtered.length === 0) {
      store$.metaSourceLookup.delete(reference.src)
    } else {
      store$.metaSourceLookup.set(reference.src, filtered)
    }
  }

  const metaIndex = store$.sourceMetaIndex.get(meta)
  if (metaIndex) {
    metaIndex.referenceIds = metaIndex.referenceIds.filter((id) => id !== reference.id)
  }
}

export function indexEntanglement(
  entanglement: GlobalTopologyEntanglement,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  store$.entanglementAddressIndex.set(entanglement.entanglementAddress, entanglement.id)

  const metaIndex = ensureMetaIndex(store$, meta)
  metaIndex.entanglementIds = appendUnique(metaIndex.entanglementIds, entanglement.id)
}

export function removeEntanglementIndexes(
  entanglement: GlobalTopologyEntanglement,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  store$.entanglementAddressIndex.delete(entanglement.entanglementAddress)

  const metaIndex = store$.sourceMetaIndex.get(meta)
  if (metaIndex) {
    metaIndex.entanglementIds = metaIndex.entanglementIds.filter((id) => id !== entanglement.id)
  }
}

export function indexObject(
  objectId: string,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  const metaIndex = ensureMetaIndex(store$, meta)
  metaIndex.objectIds = appendUnique(metaIndex.objectIds, objectId)
}

export function removeObjectIndex(
  objectId: string,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  const metaIndex = store$.sourceMetaIndex.get(meta)
  if (metaIndex) {
    metaIndex.objectIds = metaIndex.objectIds.filter((id) => id !== objectId)
  }
}

export function getPlacementIdByAddress(
  address: string,
  store: Pick<StrongIndexes, "placementAddressIndex"> = strong$,
): string | undefined {
  return store.placementAddressIndex.get(address)
}

export function getPlacementIdsByObject(
  objectId: string,
  store: Pick<StrongIndexes, "objectPlacementsIndex"> = strong$,
): string[] {
  return store.objectPlacementsIndex.get(objectId) ?? []
}

export function getPlacementIdsByMeta(
  meta: string,
  store: Pick<StrongIndexes, "sourceMetaIndex"> = strong$,
): string[] {
  return store.sourceMetaIndex.get(meta)?.placementIds ?? []
}

export function getReferenceIdsBySource(
  metaSource: string,
  store: Pick<StrongIndexes, "metaSourceLookup"> = strong$,
): string[] {
  return store.metaSourceLookup.get(metaSource) ?? []
}

export function getEntanglementIdByAddress(
  address: string,
  store: Pick<StrongIndexes, "entanglementAddressIndex"> = strong$,
): string | undefined {
  return store.entanglementAddressIndex.get(address)
}

export function isPlacementIndexed(
  address: string,
  store: Pick<StrongIndexes, "placementAddressIndex"> = strong$,
): boolean {
  return store.placementAddressIndex.has(address)
}

export function hasReferenceBySource(
  metaSource: string,
  referenceId: string,
  store: Pick<StrongIndexes, "metaSourceLookup"> = strong$,
): boolean {
  const bySource = store.metaSourceLookup.get(metaSource)
  return bySource ? bySource.includes(referenceId) : false
}
