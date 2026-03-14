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

export interface GravityStoreSnapshot {
  fragments: Map<string, LocalTopologyFragment>
  nextPlacementSeq: number
  nextLinkSeq: number
  nextReferenceSeq: number
  rootOccurrenceSeq: number
}

export interface GravityStore extends GravityStoreSnapshot {
  reset(): void
  restore(snapshot: GravityStoreSnapshot): void
  snapshot(): GravityStoreSnapshot
  setFragment(meta: string, fragment: LocalTopologyFragment): LocalTopologyFragment
  getFragment(meta: string): LocalTopologyFragment | undefined
}
