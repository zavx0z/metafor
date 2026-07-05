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
