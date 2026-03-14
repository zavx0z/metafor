import type {
  GlobalTopologyEntanglement,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
} from "./store.t.ts"
import type { StrongIndexes } from "../strong/store.t.ts"
import { strong$ } from "../strong/store.ts"

interface PlacementAddressLookupState {
  placements: ReadonlyMap<string, GlobalTopologyPlacement>
}

interface ObjectPlacementLookupState {
  placements: ReadonlyMap<string, GlobalTopologyPlacement>
}

interface MetaPlacementLookupState {
  placements: ReadonlyMap<string, GlobalTopologyPlacement>
}

interface MetaSourceLookupState {
  references: ReadonlyMap<string, GlobalTopologyReference>
}

interface EntanglementAddressLookupState {
  entanglements: ReadonlyMap<string, GlobalTopologyEntanglement>
}

interface PlacementChildrenState {
  placements: ReadonlyMap<string, GlobalTopologyPlacement>
}

function collectByIds<T>(items: ReadonlyMap<string, T>, ids: readonly string[]): T[] {
  return ids.map((id) => items.get(id)).filter(Boolean) as T[]
}

export function getPlacementByAddress(
  state: PlacementAddressLookupState,
  address: string,
  indexes: Pick<StrongIndexes, "placementAddressIndex"> = strong$,
): GlobalTopologyPlacement | undefined {
  const placementId = indexes.placementAddressIndex.get(address)
  return placementId ? state.placements.get(placementId) : undefined
}

export function getPlacementsByObject(
  state: ObjectPlacementLookupState,
  objectId: string,
  indexes: Pick<StrongIndexes, "objectPlacementsIndex"> = strong$,
): GlobalTopologyPlacement[] {
  return collectByIds(state.placements, indexes.objectPlacementsIndex.get(objectId) ?? [])
}

export function getPlacementsByMeta(
  state: MetaPlacementLookupState,
  meta: string,
  indexes: Pick<StrongIndexes, "sourceMetaIndex"> = strong$,
): GlobalTopologyPlacement[] {
  return collectByIds(state.placements, indexes.sourceMetaIndex.get(meta)?.placementIds ?? [])
}

export function getChildren(
  state: PlacementChildrenState,
  parentPlacementId: string,
): GlobalTopologyPlacement[] {
  return Array.from(state.placements.values()).filter((placement) => placement.parentId === parentPlacementId)
}

export function getReferencesBySource(
  state: MetaSourceLookupState,
  metaSource: string,
  indexes: Pick<StrongIndexes, "metaSourceLookup"> = strong$,
): GlobalTopologyReference[] {
  return collectByIds(state.references, indexes.metaSourceLookup.get(metaSource) ?? [])
}

export function getEntanglementByAddress(
  state: EntanglementAddressLookupState,
  address: string,
  indexes: Pick<StrongIndexes, "entanglementAddressIndex"> = strong$,
): GlobalTopologyEntanglement | undefined {
  const entanglementId = indexes.entanglementAddressIndex.get(address)
  return entanglementId ? state.entanglements.get(entanglementId) : undefined
}
