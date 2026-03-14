import type {
  LocalTopologyEntanglementSeed,
  LocalTopologyFragment,
  LocalTopologyObject,
  LocalTopologyObjectKind,
  LocalTopologyPlacementRelation,
  LocalTopologyReference,
} from "../../metafor/dsl/topology.t.ts"

export interface GlobalTopologyObject {
  id: string
  meta: string
  localObjectId: string
  kind: LocalTopologyObjectKind
  definition: LocalTopologyObject
}

export interface GlobalTopologyPlacement {
  id: string
  meta: string
  objectId: string
  localPlacementId: string
  localAddress: string
  address: string
  parentId?: string
  viaReferenceId?: string
  relation: LocalTopologyPlacementRelation
}

export interface GlobalTopologyLink {
  id: string
  from: string
  to: string
  relation: Exclude<LocalTopologyPlacementRelation, "root">
}

export interface GlobalTopologyReference {
  id: string
  meta: string
  localReferenceId: string
  placementId: string
  objectId: string
  address: string
  src: string
  via: LocalTopologyReference["via"]
  field?: string
  value?: string | number
}

export interface GlobalTopologyEntanglement {
  id: string
  meta: string
  placementId: string
  objectId: string
  topologyAddress: string
  entanglementAddress: string
  dataPaths: string[]
  referenceIds: string[]
  seed: LocalTopologyEntanglementSeed
}

export interface GlobalTopologyMetaIndex {
  objectIds: string[]
  placementIds: string[]
  referenceIds: string[]
  entanglementIds: string[]
}

export interface GlobalTopologyIngestOptions {
  parentPlacementId?: string
  viaReferenceId?: string
}

export interface GlobalTopologyIngestResult {
  meta: string
  rootPlacementIds: string[]
  placementIds: string[]
  referenceIds: string[]
  entanglementIds: string[]
}

export interface GlobalTopologySnapshot {
  fragments: Map<string, LocalTopologyFragment>
  objects: Map<string, GlobalTopologyObject>
  placements: Map<string, GlobalTopologyPlacement>
  links: Map<string, GlobalTopologyLink>
  references: Map<string, GlobalTopologyReference>
  entanglements: Map<string, GlobalTopologyEntanglement>
  placementAddressIndex: Map<string, string>
  entanglementAddressIndex: Map<string, string>
  objectPlacementsIndex: Map<string, string[]>
  sourceMetaIndex: Map<string, GlobalTopologyMetaIndex>
  metaSourceLookup: Map<string, string[]>
  nextPlacementSeq: number
  nextLinkSeq: number
  nextReferenceSeq: number
  rootOccurrenceSeq: number
}

export interface GlobalTopologyStore extends GlobalTopologySnapshot {
  reset(): void
  restore(snapshot: GlobalTopologySnapshot): void
  snapshot(): GlobalTopologySnapshot
  setFragment(meta: string, fragment: LocalTopologyFragment): LocalTopologyFragment
  getFragment(meta: string): LocalTopologyFragment | undefined
  ingestFragment(meta: string, fragment: LocalTopologyFragment, options?: GlobalTopologyIngestOptions): GlobalTopologyIngestResult
  getObject(id: string): GlobalTopologyObject | undefined
  getPlacement(id: string): GlobalTopologyPlacement | undefined
  getPlacementByAddress(address: string): GlobalTopologyPlacement | undefined
  getPlacementsByObject(objectId: string): readonly GlobalTopologyPlacement[]
  getPlacementsByMeta(meta: string): readonly GlobalTopologyPlacement[]
  getChildren(parentPlacementId: string): readonly GlobalTopologyPlacement[]
  getReference(id: string): GlobalTopologyReference | undefined
  getReferencesBySource(metaSource: string): readonly GlobalTopologyReference[]
  getEntanglement(id: string): GlobalTopologyEntanglement | undefined
  getEntanglementByAddress(address: string): GlobalTopologyEntanglement | undefined
}
