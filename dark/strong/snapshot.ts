import type { GlobalTopologyMetaIndex } from "../gravity/store.t.ts"
import type { StrongIndexes, StrongIndexesSnapshot } from "./store.t.ts"

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

export function cloneStrongSnapshot(snapshot: StrongIndexesSnapshot): StrongIndexesSnapshot {
  return {
    placementAddressIndex: new Map(snapshot.placementAddressIndex),
    entanglementAddressIndex: new Map(snapshot.entanglementAddressIndex),
    objectPlacementsIndex: cloneStringArrayMap(snapshot.objectPlacementsIndex),
    sourceMetaIndex: cloneMetaIndexMap(snapshot.sourceMetaIndex),
    metaSourceLookup: cloneStringArrayMap(snapshot.metaSourceLookup),
  }
}
