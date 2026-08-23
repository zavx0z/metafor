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

/**
 * Компактная запись одного возможного Transition.
 *
 * Кортеж содержит индекс целевого State и Conditions. `null` является только
 * неисполняемым местом во внутреннем списке переходов: это не `STATE_NONE`, не
 * `STATE_UNDEFINED` и не переход в State `0`.
 * Составитель удаляет такие места до подсчёта адресов.
 *
 * @see [Пустая запись не скрывает следующий Transition](https://github.com/zavx0z/metafor/blob/main/quantum/matrix/tests/superposition.spec.ts#L135-L161)
 */
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
