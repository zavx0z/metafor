import type { NodeType } from "@metafor/dsl"

export type GravityScopeKind = "map" | "cond" | "log"
export type GravityLinkKind = "scope" | "hierarchy"
export type GravityPayloadKind = "scope" | "fields"

export interface GravityProjectionScopeNode {
  nodeKind: "scope"
  id: string
  kind: GravityScopeKind
  key: string
  dataPaths: string[]
  fieldRefs: string[]
  payloadIds: string[]
  expr?: string
  children: GravityProjectionNode[]
}

export interface GravityProjectionActorNode {
  nodeKind: "actor"
  id: string
  manifestIndex: number
  key: string
  tag: string
  dataPaths: string[]
  fieldRefs: string[]
  payloadIds: string[]
  inheritedPayloadIds: string[]
  children: GravityProjectionNode[]
}

export type GravityProjectionNode = GravityProjectionScopeNode | GravityProjectionActorNode

export interface GravityActorProjection {
  roots: GravityProjectionNode[]
  payloads: GravityEntanglementPayload[]
}

export interface GravityEntanglementPayload {
  id: string
  kind: GravityPayloadKind
  ownerId: string
  ownerKey: string
  sourcePaths: string[]
  fieldRefs: string[]
  semanticKey: string
  scopeLineageKeys: string[]
  actorLineageKeys: string[]
  expr?: string
}

export interface FlatGravityScope {
  id: string
  kind: GravityScopeKind
  key: string
  dataPaths: string[]
  fieldRefs: string[]
  payloadIds: string[]
  expr?: string
  parentScopeId?: string
  parentActorId?: string
  actorIds: string[]
  scopeIds: string[]
}

export interface FlatGravityActor {
  id: string
  manifestIndex: number
  key: string
  tag: string
  dataPaths: string[]
  fieldRefs: string[]
  scopeIds: string[]
  payloadIds: string[]
  entanglementPayloadIds: string[]
  parentActorId?: string
  parentScopeId?: string
}

export interface FlatGravityLink {
  kind: GravityLinkKind
  from: string
  to: string
  payloadIds: string[]
}

export interface FlatGravityGraph {
  source: NodeType[]
  projection: GravityActorProjection
  scopes: FlatGravityScope[]
  actors: FlatGravityActor[]
  links: FlatGravityLink[]
  payloads: GravityEntanglementPayload[]
}

export interface GravityRuntimeBinding {
  actorKey: string
  fieldMap?: Record<string, string>
}

export interface RuntimeActorSnapshot {
  actorId: string
  braneIndex: number
  fieldNames: string[]
  binding?: GravityRuntimeBinding
}

export interface GravityRuntimeMatch {
  actorId: string
  braneIndex: number
  actorKey: string
  graphActorId: string
  runtimeFieldNames: string[]
}

export interface StrongEntanglementField {
  fieldName: string
  fieldRef: string
  payloadIds: string[]
  semanticKeys: string[]
  representativeBraneIndex: number
}

export interface StrongEntanglementBlock {
  key: string
  actorNodeIds: string[]
  runtimeActorIds: string[]
  braneIndices: number[]
  fields: StrongEntanglementField[]
  scopeIds: string[]
  payloadIds: string[]
  membershipSemanticKeys: string[]
}

export interface StrongEntanglementPlan {
  graph: FlatGravityGraph
  bindings: GravityRuntimeMatch[]
  blocks: StrongEntanglementBlock[]
}
