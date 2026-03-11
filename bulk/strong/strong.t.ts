export interface GravityRuntimeBinding {
  actorUuid: string
  fieldMap?: Record<string, string>
}

export interface RuntimeActorSnapshot {
  actorUuid: string
  fieldNames: string[]
  binding?: GravityRuntimeBinding
}

export interface StrongEntanglementField {
  fieldName: string
  fieldRef: string
  payloadUuids: string[]
  semanticKeys: string[]
  representativeActorUuid: string
}

export interface StrongMembershipEntanglementBlock {
  actorUuids: string[]
  scopeUuids: string[]
  semanticKeys: string[]
  fields: StrongEntanglementField[]
}

export interface StrongEntanglementPlan {
  blocks: StrongMembershipEntanglementBlock[]
}
