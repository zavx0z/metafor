/**
 * @boundary/matrix/bytecode — компиляция canonical transitions в GPU bytecode.
 *
 * Этот модуль содержит функции для компиляции графов состояний в линейный
 * bytecode, оптимизированный для выполнения на WebGPU.
 *
 * @packageDocumentation
 */

import type { BoundaryFieldRecord, BoundaryConditionRecord, BoundaryValue } from "../store.t"
import { CONDITION_OP, VALUE_TYPE } from "./constants"
import { fieldTypeToBytecodeType, encodeValue, type PackContext } from "./pack"

/**
 * Инструкция условия для bytecode.
 */
export interface ConditionInstruction {
  fieldType: number
  fieldIndex: number
  op: number
  valEncoded: number
}

/**
 * Результат компиляции условий.
 */
export interface CompiledConditionsResult {
  instructions: ConditionInstruction[]
  heap: number[]
}

/**
 * Flattened transition формат.
 */
export interface FlattenedTransition {
  targetState: number | null
  conditions: Array<{
    fieldIndex: number
    checks: Array<{
      op: number
      val: number | boolean | (number | boolean)[]
    }>
  }>
}

/**
 * Компилирует распарсенные условия в инструкции.
 */
export function compileParsedConditions(
  parsedChecks: Array<{ fieldIndex: number; checks: Array<{ op: number; val: unknown }> }>,
  fields: BoundaryFieldRecord[],
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
    if (!field) continue

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

  const totalInstructionsSize = allChecks.length * 4
  let heapOffset = totalInstructionsSize

  for (const check of allChecks) {
    const ctx: PackContext = { type: check.fieldType, stringTable }
    const field = fields[check.fieldIndex]
    if (field?.enum !== undefined) {
      ctx.enum = field.enum
    }
    if (field?.elementType !== undefined) {
      switch (field.elementType) {
        case "number":
          ctx.subType = VALUE_TYPE.FLOAT
          break
        case "string":
          ctx.subType = VALUE_TYPE.STRING
          break
        case "boolean":
          ctx.subType = VALUE_TYPE.BOOL
          break
      }
    }

    let valEncoded: number

    if (Array.isArray(check.val) && (check.op === CONDITION_OP.IN || check.op === CONDITION_OP.NOT_IN)) {
      const ptr = heapOffset
      heap.push(check.val.length)
      for (const v of check.val) {
        if (ctx.enum !== undefined && typeof v === "string") {
          const idx = ctx.enum.indexOf(v)
          if (idx === -1) {
            throw new Error(`Value '${v}' not found in enum: [${ctx.enum}]`)
          }
          heap.push(encodeValue(idx, ctx).value1)
        } else if (check.fieldType === VALUE_TYPE.STRING && typeof v === "string") {
          heap.push(encodeValue(v as unknown as BoundaryValue, ctx).value1)
        } else {
          heap.push(encodeValue(v as number | boolean, ctx).value1)
        }
      }
      heapOffset += 1 + check.val.length
      instructions.push({
        fieldType: check.fieldType,
        fieldIndex: check.fieldIndex,
        op: check.op,
        valEncoded: ptr,
      })
    } else {
      const encodeCtx = getArrayEncodingContext(ctx, check.op, check.fieldType)

      let valToEncode = check.val
      if (encodeCtx.enum !== undefined && typeof check.val === "string") {
        const idx = encodeCtx.enum.indexOf(check.val)
        if (idx === -1) {
          throw new Error(`Value '${check.val}' not found in enum: [${encodeCtx.enum}]`)
        }
        valToEncode = idx
      }
      valEncoded = encodeValue(valToEncode as number | boolean, encodeCtx).value1

      instructions.push({
        fieldType: check.fieldType,
        fieldIndex: check.fieldIndex,
        op: check.op,
        valEncoded,
      })
    }
  }

  return { instructions, heap }
}

function getArrayEncodingContext(
  ctx: PackContext,
  op: number,
  fieldType: number,
): PackContext {
  if (fieldType !== VALUE_TYPE.ARRAY) {
    return ctx
  }

  if (
    ctx.subType !== undefined &&
    (op === CONDITION_OP.IN || op === CONDITION_OP.NOT_IN)
  ) {
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
  fields: BoundaryFieldRecord[],
  stringTable: string[],
): { bytecode: Uint32Array; bytecodeOffset: number } {
  const numStates = transitions.length

  const condBlocksData: { instructions: number[]; heap: number[] }[] = []
  const stateTransitionsCount: number[] = []

  for (const stateTransitions of transitions) {
    const trCount = stateTransitions.filter((t) => t.targetState !== null).length
    stateTransitionsCount.push(trCount)

    for (const transition of stateTransitions) {
      if (transition.targetState === null) continue

      const { instructions, heap } = compileParsedConditions(
        transition.conditions,
        fields,
        stringTable,
      )

      const instrFlat: number[] = [instructions.length]
      for (const instr of instructions) {
        instrFlat.push(instr.fieldType)
        instrFlat.push(instr.fieldIndex)
        instrFlat.push(instr.op)
        instrFlat.push(instr.valEncoded)
      }

      condBlocksData.push({ instructions: instrFlat, heap })
    }
  }

  const stateTableLength = numStates
  const stateBlocksLength = transitions.reduce((sum, stateTransitions) => {
    const trCount = stateTransitions.filter((t) => t.targetState !== null).length
    const nullCount = stateTransitions.filter((t) => t.targetState === null).length
    return sum + 1 + trCount * 2 + nullCount * 2
  }, 0)
  const condBlocksStart = stateTableLength + stateBlocksLength

  const condBlockSizes = condBlocksData.map((b) => b.instructions.length + b.heap.length)

  const statePtrs: number[] = []
  const stateBlocks: number[] = []

  let condBlockIdx = 0
  let condBlockOffset = condBlocksStart

  for (let s = 0; s < numStates; s++) {
    const stateBlockStart = stateTableLength + stateBlocks.length
    statePtrs.push(stateBlockStart)

    const stateTransitions = transitions[s]!
    const trCount = stateTransitionsCount[s]!
    stateBlocks.push(trCount)

    for (const transition of stateTransitions) {
      if (transition.targetState === null) {
        stateBlocks.push(0)
        stateBlocks.push(0)
        continue
      }

      stateBlocks.push(transition.targetState)
      stateBlocks.push(condBlockOffset)

      condBlockOffset += condBlockSizes[condBlockIdx]!
      condBlockIdx++
    }
  }

  const finalBytecode = [...statePtrs, ...stateBlocks]
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
  fields: BoundaryFieldRecord[],
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
