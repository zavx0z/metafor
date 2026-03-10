import type { NodeType } from "@metafor/dsl"

export type GravityScopeKind = "map" | "cond" | "log"
export type GravityLinkKind = "scope" | "hierarchy"

export interface FlatGravityScope {
  id: string
  kind: GravityScopeKind
  dataPaths: string[]
  fieldRefs: string[]
  expr?: string
  parentScopeId?: string
  parentActorId?: string
  actorIds: string[]
}

export interface FlatGravityActor {
  id: string
  manifestIndex: number
  tag: string
  dataPaths: string[]
  fieldRefs: string[]
  scopeIds: string[]
  parentActorId?: string
  parentScopeId?: string
}

export interface FlatGravityLink {
  kind: GravityLinkKind
  from: string
  to: string
  fieldRefs: string[]
}

export interface FlatGravityGraph {
  source: NodeType[]
  scopes: FlatGravityScope[]
  actors: FlatGravityActor[]
  links: FlatGravityLink[]
}

export interface RuntimeActorSnapshot {
  actorId: string
  braneIndex: number
  fieldNames: string[]
}

export interface StrongEntanglementBlock {
  key: string
  actorNodeIds: string[]
  braneIndices: number[]
  fieldNames: string[]
  scopeIds: string[]
}

export interface StrongEntanglementPlan {
  graph: FlatGravityGraph
  blocks: StrongEntanglementBlock[]
}
