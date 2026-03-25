import type { FieldKey } from "@metafor/ast"
import type { PreparedEntanglementProjection } from "@boundary/strong"

export interface BoundaryDatabaseFieldSchemaRecord {
  type: string
  required: boolean
  topology: boolean
  label?: string
  values?: Array<string | number>
}

export interface BoundaryDatabaseBraneRecord {
  index: number
  fieldOffset: number
  fieldCount: number
}

export interface BoundaryDatabaseFieldRecord {
  index: number
  ownerBraneIndex: number
  key: FieldKey
  schema: BoundaryDatabaseFieldSchemaRecord
}

export interface BoundaryDatabaseFieldValueRecord {
  fieldIndex: number
  value: unknown
}

export interface BoundaryDatabaseEntanglementBlockRecord {
  index: number
  key: string
}

export interface BoundaryDatabaseEntanglementBlockMemberRecord {
  blockIndex: number
  memberIndex: number
  braneIndex: number
}

export interface BoundaryDatabaseEntanglementFieldRecord {
  index: number
  blockIndex: number
  blockFieldIndex: number
  semanticKey: string
  fieldName: string
  representativeBraneIndex: number
  representativeFieldIndex: number
  payloadIds: string[]
  semanticKeys: string[]
}

export interface BoundaryDatabaseEntanglementFieldMemberRecord {
  entanglementFieldIndex: number
  memberIndex: number
  braneIndex: number
  fieldIndex: number
}

export interface BoundaryDatabaseStateSeedStateRecord {
  ownerBraneIndex: number
  stateIndex: number
  stateName: string
  initial: boolean
}

export interface BoundaryDatabaseStateSeedTransitionRecord {
  index: number
  ownerBraneIndex: number
  fromStateIndex: number
  transitionIndex: number
  targetStateIndex: number | null
}

export interface BoundaryDatabaseStateSeedConditionRecord {
  transitionSeedIndex: number
  conditionIndex: number
  fieldIndex: number
  condition: unknown
}

export interface BoundaryDatabaseData {
  branes: BoundaryDatabaseBraneRecord[]
  fields: BoundaryDatabaseFieldRecord[]
  fieldValues: BoundaryDatabaseFieldValueRecord[]
  entanglementBlocks: BoundaryDatabaseEntanglementBlockRecord[]
  entanglementBlockMembers: BoundaryDatabaseEntanglementBlockMemberRecord[]
  entanglementFields: BoundaryDatabaseEntanglementFieldRecord[]
  entanglementFieldMembers: BoundaryDatabaseEntanglementFieldMemberRecord[]
  stateSeedStates: BoundaryDatabaseStateSeedStateRecord[]
  stateSeedTransitions: BoundaryDatabaseStateSeedTransitionRecord[]
  stateSeedConditions: BoundaryDatabaseStateSeedConditionRecord[]
}

export interface BoundarySharedDbRuntimeOptions {
  entanglement?: PreparedEntanglementProjection
}
