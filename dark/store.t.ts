import type { MetaAST } from "@metafor/ast"
import type {
  GlobalTopologyEntanglement,
  GlobalTopologyLink,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
} from "./gravity/store.t.ts"

export interface DarkStoreSnapshot {
  meta: Map<string, MetaAST>
  objects: Map<string, GlobalTopologyObject>
  placements: Map<string, GlobalTopologyPlacement>
  links: Map<string, GlobalTopologyLink>
  references: Map<string, GlobalTopologyReference>
  entanglements: Map<string, GlobalTopologyEntanglement>
}

export interface DarkStore extends DarkStoreSnapshot {
  reset(): void
  restore(snapshot: DarkStoreSnapshot): void
  snapshot(): DarkStoreSnapshot
  setMeta(address: string, meta: MetaAST): MetaAST
  getMeta(address: string): MetaAST | undefined
  setObject(id: string, object: GlobalTopologyObject): GlobalTopologyObject
  getObject(id: string): GlobalTopologyObject | undefined
  deleteObject(id: string): void
  setPlacement(id: string, placement: GlobalTopologyPlacement): GlobalTopologyPlacement
  getPlacement(id: string): GlobalTopologyPlacement | undefined
  deletePlacement(id: string): void
  setLink(id: string, link: GlobalTopologyLink): GlobalTopologyLink
  getLink(id: string): GlobalTopologyLink | undefined
  deleteLink(id: string): void
  setReference(id: string, reference: GlobalTopologyReference): GlobalTopologyReference
  getReference(id: string): GlobalTopologyReference | undefined
  deleteReference(id: string): void
  setEntanglement(id: string, entanglement: GlobalTopologyEntanglement): GlobalTopologyEntanglement
  getEntanglement(id: string): GlobalTopologyEntanglement | undefined
  deleteEntanglement(id: string): void
}

export type {
  GlobalTopologyEntanglement,
  GlobalTopologyLink,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
}
