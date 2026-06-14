import type { FieldKey } from "../index.ts"
import type { PreparedEntanglementProjection } from "@energy/strong"

export interface EnergyDatabaseFieldSchemaRecord {
  type: string
  required: boolean
  topology: boolean
  label?: string
  values?: readonly (string | number)[]
}

export interface EnergyDatabaseBraneRecord {
  index: number
  fieldOffset: number
  fieldCount: number
}

export interface EnergyDatabaseFieldRecord {
  index: number
  ownerBraneIndex: number
  wimpFieldId: string
  key: FieldKey
  schema: EnergyDatabaseFieldSchemaRecord
}

export interface EnergyDatabaseFieldValueRecord {
  fieldIndex: number
  value: unknown
}

export interface EnergyDatabaseEntanglementBlockRecord {
  index: number
  key: string
}

export interface EnergyDatabaseEntanglementBlockMemberRecord {
  blockIndex: number
  memberIndex: number
  braneIndex: number
}

export interface EnergyDatabaseEntanglementFieldRecord {
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

export interface EnergyDatabaseEntanglementFieldMemberRecord {
  entanglementFieldIndex: number
  memberIndex: number
  braneIndex: number
  fieldIndex: number
}

export interface EnergyDatabaseStateSeedStateRecord {
  ownerBraneIndex: number
  stateIndex: number
  metaStateId: string
  stateName: string
  initial: boolean
}

export interface EnergyDatabaseStateSeedTransitionRecord {
  index: number
  ownerBraneIndex: number
  fromStateIndex: number
  transitionIndex: number
  targetStateIndex: number | null
}

export interface EnergyDatabaseStateSeedConditionRecord {
  transitionSeedIndex: number
  conditionIndex: number
  fieldIndex: number
  condition: unknown
}

export interface EnergyDatabaseData {
  branes: EnergyDatabaseBraneRecord[]
  fields: EnergyDatabaseFieldRecord[]
  fieldValues: EnergyDatabaseFieldValueRecord[]
  entanglementBlocks: EnergyDatabaseEntanglementBlockRecord[]
  entanglementBlockMembers: EnergyDatabaseEntanglementBlockMemberRecord[]
  entanglementFields: EnergyDatabaseEntanglementFieldRecord[]
  entanglementFieldMembers: EnergyDatabaseEntanglementFieldMemberRecord[]
  stateSeedStates: EnergyDatabaseStateSeedStateRecord[]
  stateSeedTransitions: EnergyDatabaseStateSeedTransitionRecord[]
  stateSeedConditions: EnergyDatabaseStateSeedConditionRecord[]
}

export interface EnergyDbRuntimeOptions {
  entanglement?: PreparedEntanglementProjection
}

export interface EnergyRuntimeForceData {
  runtimeFieldIndexByWimpFieldId: Map<string, number>
  wimpFieldIdsByRuntimeFieldIndex: string[][]
  braneIndexByWimpFieldId: Map<string, number>
  topologyWimpFieldIds: Set<string>
  stateMetaStateIdsByBraneIndex: string[][]
  stateProcessIdsByBraneIndex: Array<Array<string | undefined>>
}
