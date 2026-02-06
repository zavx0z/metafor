export const OP = {
  EQ: 0,
  NEQ: 1,
  GT: 2,
  LT: 3,
  GTE: 4,
  LTE: 5,
} as const

export const TYPE = {
  FLOAT: 0,
  UINT: 1,
  BOOL: 2,
} as const

export type StateID = number

export interface CompiledRules {
  bytecode: Uint32Array
  stateTableOffset: number
  fieldMap: Record<string, { type: number; index: number }>
  stateMap: Record<string, number>
}
