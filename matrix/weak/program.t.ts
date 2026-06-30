/**
 * Типы внутренней программы переходов слабого слоя.
 *
 * @packageDocumentation
 */

import type { Collapse } from "../gravity/schema.t"

export interface ConditionInstruction {
  fieldType: number
  fieldIndex: number
  op: number
  valEncoded: number
}

export interface CompiledConditionsResult {
  instructions: ConditionInstruction[]
  heap: number[]
}

export interface BytecodeLayout {
  stateTable: number[]
  stateBlocks: number[]
  conditionBlocks: number[]
  heap: number[]
}

export interface FieldBytecode {
  bytecode: Uint32Array
  bytecodeOffset: number
}

export interface CompiledRules {
  bytecode: Uint32Array
  bytecodeOffsets: Uint32Array
}

export interface ConvertedSuperposition {
  states: string[]
  matrix: {
    transitions: Array<Array<Collapse>>
  }
}
