/**
 * `@energy/weak/gpu/bytecode` компилирует канонические transitions в производный GPU bytecode.
 *
 * Модуль переводит графы состояний в линейную execution-форму, понятную WebGPU runtime.
 */

import type { EnergyFieldRecord, EnergyValue } from "../../store.t"
import type { CompiledConditionsResult, ConditionInstruction, FlattenedTransition } from "./bytecode.t"
import { OP, VALUE_TYPE } from "../constants"
import { encodeValue, fieldTypeToBytecodeType, type PackContext } from "./pack"

export type { CompiledConditionsResult, ConditionInstruction, FlattenedTransition } from "./bytecode.t"

/**
 * Компилирует распарсенные условия в инструкции.
 */
export function compileParsedConditions(
  parsedChecks: Array<{ fieldIndex: number; checks: Array<{ op: number; val: unknown }> }>,
  fields: EnergyFieldRecord[],
  stringTable: string[],
): CompiledConditionsResult {
  const instructions: ConditionInstruction[] = []
  const heap: number[] = []
  const allChecks: Array<{
    fieldIndex: number
    fieldType: number
    op: number
    val: unknown
  }> = []

  for (const { fieldIndex, checks } of parsedChecks) {
    const field = fields[fieldIndex]
    if (!field) {
      continue
    }

    const fieldType = fieldTypeToBytecodeType(field.type)
    for (const check of checks) {
      allChecks.push({
        fieldIndex,
        fieldType,
        op: check.op,
        val: check.val,
      })
    }
  }

  let heapOffset = allChecks.length * 4

  for (const check of allChecks) {
    const context: PackContext = { type: check.fieldType, stringTable }
    const field = fields[check.fieldIndex]
    if (field?.enum !== undefined) {
      context.enum = field.enum
    }
    if (field?.elementType !== undefined) {
      switch (field.elementType) {
        case "number":
          context.subType = VALUE_TYPE.FLOAT
          break
        case "string":
          context.subType = VALUE_TYPE.STRING
          break
        case "boolean":
          context.subType = VALUE_TYPE.BOOL
          break
      }
    }

    let valEncoded: number

    if (Array.isArray(check.val) && (check.op === OP.IN || check.op === OP.NOT_IN)) {
      const ptr = heapOffset
      heap.push(check.val.length)
      for (const value of check.val) {
        if (context.enum !== undefined && typeof value === "string") {
          const enumIndex = context.enum.indexOf(value)
          if (enumIndex === -1) {
            throw new Error(`Value '${value}' not found in enum: [${context.enum}]`)
          }
          heap.push(encodeValue(enumIndex, context).value1)
        } else if (check.fieldType === VALUE_TYPE.STRING && typeof value === "string") {
          heap.push(encodeValue(value as unknown as EnergyValue, context).value1)
        } else {
          heap.push(encodeValue(value as number | boolean, context).value1)
        }
      }
      heapOffset += 1 + check.val.length
      instructions.push({
        fieldType: check.fieldType,
        fieldIndex: check.fieldIndex,
        op: check.op,
        valEncoded: ptr,
      })
      continue
    }

    const encodeContext = getArrayEncodingContext(context, check.op, check.fieldType)
    let valueToEncode = check.val
    if (encodeContext.enum !== undefined && typeof check.val === "string") {
      const enumIndex = encodeContext.enum.indexOf(check.val)
      if (enumIndex === -1) {
        throw new Error(`Value '${check.val}' not found in enum: [${encodeContext.enum}]`)
      }
      valueToEncode = enumIndex
    }
    valEncoded = encodeValue(valueToEncode as number | boolean, encodeContext).value1

    instructions.push({
      fieldType: check.fieldType,
      fieldIndex: check.fieldIndex,
      op: check.op,
      valEncoded,
    })
  }

  return { instructions, heap }
}

function getArrayEncodingContext(ctx: PackContext, op: number, fieldType: number): PackContext {
  if (fieldType !== VALUE_TYPE.ARRAY) {
    return ctx
  }

  if (ctx.subType !== undefined && (op === OP.IN || op === OP.NOT_IN)) {
    const nextContext: PackContext = { type: ctx.subType, stringTable: ctx.stringTable }
    if (ctx.enum !== undefined) {
      nextContext.enum = ctx.enum
    }
    return nextContext
  }

  const nextContext: PackContext = { type: VALUE_TYPE.UINT, stringTable: ctx.stringTable }
  if (ctx.enum !== undefined) {
    nextContext.enum = ctx.enum
  }
  return nextContext
}

/**
 * Компилирует transitions одной браны в bytecode.
 */
export function compileFlattenedSuperposition(
  transitions: FlattenedTransition[][],
  fields: EnergyFieldRecord[],
  stringTable: string[],
): { bytecode: Uint32Array; bytecodeOffset: number } {
  const numStates = transitions.length
  const condBlocksData: { instructions: number[]; heap: number[] }[] = []
  const stateTransitionsCount: number[] = []

  for (const stateTransitions of transitions) {
    const transitionCount = stateTransitions.filter((transition) => transition.targetState !== null).length
    stateTransitionsCount.push(transitionCount)

    for (const transition of stateTransitions) {
      if (transition.targetState === null) {
        continue
      }

      const { instructions, heap } = compileParsedConditions(transition.conditions, fields, stringTable)
      const flattenedInstructions: number[] = [instructions.length]
      for (const instruction of instructions) {
        flattenedInstructions.push(instruction.fieldType)
        flattenedInstructions.push(instruction.fieldIndex)
        flattenedInstructions.push(instruction.op)
        flattenedInstructions.push(instruction.valEncoded)
      }

      condBlocksData.push({ instructions: flattenedInstructions, heap })
    }
  }

  const stateTableLength = numStates
  const stateBlocksLength = transitions.reduce((sum, stateTransitions) => {
    const transitionCount = stateTransitions.filter((transition) => transition.targetState !== null).length
    const terminalCount = stateTransitions.filter((transition) => transition.targetState === null).length
    return sum + 1 + transitionCount * 2 + terminalCount * 2
  }, 0)
  const condBlocksStart = stateTableLength + stateBlocksLength
  const condBlockSizes = condBlocksData.map((block) => block.instructions.length + block.heap.length)
  const statePointers: number[] = []
  const stateBlocks: number[] = []

  let condBlockIndex = 0
  let condBlockOffset = condBlocksStart

  for (let stateIndex = 0; stateIndex < numStates; stateIndex++) {
    const stateBlockStart = stateTableLength + stateBlocks.length
    statePointers.push(stateBlockStart)

    const stateTransitions = transitions[stateIndex]!
    const transitionCount = stateTransitionsCount[stateIndex]!
    stateBlocks.push(transitionCount)

    for (const transition of stateTransitions) {
      if (transition.targetState === null) {
        stateBlocks.push(0)
        stateBlocks.push(0)
        continue
      }

      stateBlocks.push(transition.targetState)
      stateBlocks.push(condBlockOffset)
      condBlockOffset += condBlockSizes[condBlockIndex]!
      condBlockIndex++
    }
  }

  const finalBytecode = [...statePointers, ...stateBlocks]
  for (const block of condBlocksData) {
    finalBytecode.push(...block.instructions)
    finalBytecode.push(...block.heap)
  }

  return {
    bytecode: new Uint32Array(finalBytecode),
    bytecodeOffset: 0,
  }
}

/**
 * Компилирует ансамбль бран в bytecode.
 */
export function compileFlattenedEnsemble(
  branes: Array<{ transitions: FlattenedTransition[][] }>,
  fields: EnergyFieldRecord[],
  stringTable: string[],
): { bytecode: Uint32Array; bytecodeOffsets: Uint32Array } {
  const allBytecode: number[] = []
  const offsets: number[] = []

  for (const brane of branes) {
    const { bytecode } = compileFlattenedSuperposition(brane.transitions, fields, stringTable)
    offsets.push(allBytecode.length)
    allBytecode.push(...bytecode)
  }

  return {
    bytecode: new Uint32Array(allBytecode),
    bytecodeOffsets: new Uint32Array(offsets),
  }
}
