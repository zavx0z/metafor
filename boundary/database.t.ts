import type { FieldKey } from "@metafor/ast"
import type { PreparedEntanglementProjection } from "@boundary/strong"
import type { SharedDbData } from "@shared/db"

export interface BoundaryDatabaseFieldSchemaRecord {
  type: string
  required: boolean
  topology: boolean
  label?: string
  values?: Array<string | number>
}

export interface BoundaryDatabaseBraneRecord {
  index: number
  wimpId: string
  metaId: string
  src: string
  name?: string
  fieldOffset: number
  fieldCount: number
}

export interface BoundaryDatabaseFieldRecord {
  index: number
  wimpFieldId: string
  metaFieldId: string
  ownerBraneIndex: number
  key: FieldKey
  schema: BoundaryDatabaseFieldSchemaRecord
}

export interface BoundaryDatabaseFieldValueRecord {
  fieldIndex: number
  wimpFieldId: string
  value: unknown
}

export interface BoundaryDatabaseFieldSourceRecord {
  id: string
  childFieldIndex: number
  parentFieldIndex: number
}

export interface BoundaryDatabaseEntanglementBlockRecord {
  index: number
  entanglementId: string
  key: string
}

export interface BoundaryDatabaseEntanglementBlockMemberRecord {
  index: number
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
  index: number
  entanglementFieldIndex: number
  memberIndex: number
  braneIndex: number
  fieldIndex: number
}

export interface BoundaryDatabaseStateSeedStateRecord {
  index: number
  ownerBraneIndex: number
  stateIndex: number
  metaStateId: string
  name: string
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
  index: number
  transitionSeedIndex: number
  conditionIndex: number
  fieldIndex: number
  condition: unknown
}

export interface BoundaryDatabaseData {
  rootBraneIndex: number
  branes: BoundaryDatabaseBraneRecord[]
  fields: BoundaryDatabaseFieldRecord[]
  fieldValues: BoundaryDatabaseFieldValueRecord[]
  fieldSources: BoundaryDatabaseFieldSourceRecord[]
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

export interface BoundaryRuntimePackage {
  wimpId: string
  data: SharedDbData
}

export interface BoundaryDatabase extends BoundaryDatabaseData {
  braneIndexByWimpId: Map<string, number>
  fieldIndexByWimpFieldId: Map<string, number>
  fieldIndexByBraneAndKey: Map<number, Map<FieldKey, number>>
  fieldSourceByChildFieldIndex: Array<BoundaryDatabaseFieldSourceRecord | undefined>
  dependentFieldIndexesByParentFieldIndex: Map<number, number[]>

  reset(): void
  restore(data: BoundaryDatabaseData): void
  getBrane(braneIndex: number): BoundaryDatabaseBraneRecord | undefined
  getBraneByWimpId(wimpId: string): BoundaryDatabaseBraneRecord | undefined
  getField(fieldIndex: number): BoundaryDatabaseFieldRecord | undefined
  getFieldByWimpFieldId(wimpFieldId: string): BoundaryDatabaseFieldRecord | undefined
  getFieldByKey(braneIndex: number, fieldKey: FieldKey): BoundaryDatabaseFieldRecord | undefined
  getFieldValue(fieldIndex: number): BoundaryDatabaseFieldValueRecord | undefined
  getFieldSource(childFieldIndex: number): BoundaryDatabaseFieldSourceRecord | undefined
  getDependentFields(parentFieldIndex: number): BoundaryDatabaseFieldRecord[]
  setFieldValue(fieldIndex: number, value: unknown): void
}
