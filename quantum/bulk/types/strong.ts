export interface StrongEntanglementField {
  fieldName: string
  fieldRef: string
  payloadUuids: string[]
  semanticKeys: string[]
  representativeAtomUuid: string
}

export interface StrongMembershipEntanglementBlock {
  atomUuids: string[]
  scopeUuids: string[]
  semanticKeys: string[]
  fields: StrongEntanglementField[]
}

export interface StrongEntanglementPlan {
  blocks: StrongMembershipEntanglementBlock[]
}
