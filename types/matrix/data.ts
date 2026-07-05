import type { MatrixConditionValue, MatrixParsedCheck } from "./condition.ts"
import type { PreparedEntanglementProjection } from "./entanglement.ts"

export type MatrixFieldType = 0 | 1 | 2 | 3 | 4

export type MatrixBraneValue =
  | number
  | boolean
  | string
  | null
  | number[]
  | boolean[]
  | string[]

export type MatrixCollapse = [number, Record<number, MatrixConditionValue>] | null

export interface MatrixFieldRecord {
  type: MatrixFieldType
  elementType?: "number" | "string" | "boolean"
  enum?: unknown[]
}

export interface MatrixInputBrane {
  values: [number, MatrixBraneValue][]
  state: number
  collapses: MatrixCollapse[][]
}

export interface MatrixInputData {
  fields?: MatrixFieldRecord[]
  branes?: MatrixInputBrane[]
  entanglement?: PreparedEntanglementProjection
  stateNames?: string[][]
}

export interface FlattenedFieldChecks {
  fieldIndex: number
  checks: MatrixParsedCheck[]
}

export interface FlattenedTransition {
  targetState: number | null
  conditions: FlattenedFieldChecks[]
}

export interface FlattenedBraneInput {
  values: [number, MatrixBraneValue][]
  state: number
  transitions: FlattenedTransition[][]
  stateNames: string[]
}

export interface FlattenedMatrixInput {
  fields: MatrixFieldRecord[]
  branes: FlattenedBraneInput[]
  entanglement?: PreparedEntanglementProjection
}

export interface MatrixRuntimeBrane {
  values: Array<[number, MatrixBraneValue]>
  state: number
  collapses: MatrixCollapse[][]
}

export interface MatrixRuntimeData {
  fields: MatrixFieldRecord[]
  branes: MatrixRuntimeBrane[]
  stateNames: string[][]
}
