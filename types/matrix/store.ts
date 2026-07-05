import type { MatrixConditionRecord } from "./condition.ts"
import type { MatrixFieldRecord } from "./data.ts"

export type MatrixScalarValue = number | boolean
export type MatrixValue = MatrixScalarValue | MatrixScalarValue[]

export interface MatrixFieldValueRecord {
  fieldIndex: number
  value: MatrixValue
}

export interface MatrixTransitionRecord {
  targetState: number
  conditionOffset: number
  conditionCount: number
}

export interface MatrixStateRecord {
  transitionOffset: number
  transitionCount: number
}

export interface MatrixSharedBlockRecord {
  valueOffset: number
  valueCount: number
}

export interface MatrixBraneRecord {
  localValueOffset: number
  localValueCount: number
  sharedBlockRefOffset: number
  sharedBlockRefCount: number
  stateOffset: number
  stateCount: number
  lock: boolean
}

export type MatrixFieldStorageLocation =
  | { scope: "local"; record: MatrixFieldValueRecord }
  | { scope: "shared"; blockIndex: number; record: MatrixFieldValueRecord }

export interface MatrixData {
  fields: MatrixFieldRecord[]
  stringTable: string[]
  sharedBlocks: MatrixSharedBlockRecord[]
  sharedValues: MatrixFieldValueRecord[]
  branes: MatrixBraneRecord[]
  braneValues: MatrixFieldValueRecord[]
  braneSharedBlockRefs: number[]
  stateTable: MatrixStateRecord[]
  transitions: MatrixTransitionRecord[]
  conditions: MatrixConditionRecord[]
  states: number[]
  stateNames: string[][]
}

export interface MatrixStore extends MatrixData {
  getField(braneIndex: number, fieldIndex: number): MatrixFieldValueRecord | undefined
  getFieldLocation(braneIndex: number, fieldIndex: number): MatrixFieldStorageLocation | undefined
  getFieldValue(braneIndex: number, fieldIndex: number): MatrixValue | undefined
  getState(braneIndex: number, stateIndex: number): MatrixStateRecord | undefined
  getStateName(braneIndex: number, stateIndex: number): string | undefined
}
