export type MatrixConditionOperator = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

export type MatrixConditionScalarValue = number | boolean | string | null

export interface MatrixConditionOperators {
  null?: boolean
  eq?: MatrixConditionScalarValue
  ne?: MatrixConditionScalarValue
  neq?: MatrixConditionScalarValue
  notEq?: MatrixConditionScalarValue
  gt?: MatrixConditionScalarValue
  lt?: MatrixConditionScalarValue
  gte?: MatrixConditionScalarValue
  lte?: MatrixConditionScalarValue
  in?: MatrixConditionScalarValue[]
  notIn?: MatrixConditionScalarValue[]
  include?: MatrixConditionScalarValue
  notInclude?: MatrixConditionScalarValue
  length?: MatrixConditionScalarValue | MatrixConditionOperators
  isEmpty?: boolean
  notGt?: MatrixConditionScalarValue
  notGte?: MatrixConditionScalarValue
  notLt?: MatrixConditionScalarValue
  notLte?: MatrixConditionScalarValue
  between?: [MatrixConditionScalarValue, MatrixConditionScalarValue]
}

export type MatrixConditionValue = MatrixConditionScalarValue | MatrixConditionOperators

export interface MatrixParsedCheck {
  op: MatrixConditionOperator
  val: MatrixConditionScalarValue | MatrixConditionScalarValue[]
}

export interface MatrixConditionRecord {
  fieldIndex: number
  op: MatrixConditionOperator
  value: number | boolean | Array<number | boolean>
}

export interface MatrixConditionInstruction {
  fieldType: number
  fieldIndex: number
  op: number
  valEncoded: number
}

export interface MatrixCompiledConditionsResult {
  instructions: MatrixConditionInstruction[]
  heap: number[]
}
