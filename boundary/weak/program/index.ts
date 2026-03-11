/**
 * Внутренние компиляторы программ переходов слабого слоя.
 *
 * @packageDocumentation
 */

import { parseCondition } from "../../gravity/condition"
import type { FlattenedTransition } from "../../gravity/flattened.t"
import type { Collapse, Field } from "../../gravity/schema.t"
import { createStoredStringInterner, type StringInterner } from "../../strong/string-table"
import { OP, TYPE } from "../constants"
import { encodeValue, fieldTypeToBytecodeType } from "../encode"
import type {
  CompiledConditionsResult,
  CompiledRules,
  ConditionInstruction,
  FieldBytecode,
} from "../program.t"
import type { EncodingContext } from "../encode.t"
import type { ParsedCheck } from "../../gravity/condition.t"

export function compileSuperposition(
  collapses: Collapse[][],
  fields: Field[],
  stringInterner = createStoredStringInterner(),
): FieldBytecode {
  const flattened = collapses.map((stateTransitions) =>
    stateTransitions.map((collapse) =>
      collapse === null
        ? { targetState: null, conditions: [] }
        : {
            targetState: collapse[0],
            conditions: Object.entries(collapse[1]).map(([fieldIdxStr, condValue]) => ({
              fieldIndex: Number(fieldIdxStr),
              checks: parseCondition(condValue),
            })),
          },
    ),
  )

  return compileFlattenedSuperposition(flattened, fields, stringInterner)
}

export function compileFlattenedSuperposition(
  transitions: FlattenedTransition[][],
  fields: Field[],
  stringInterner: StringInterner,
): FieldBytecode {
  const numStates = transitions.length
  const condBlocksData: { instructions: number[]; heap: number[] }[] = []
  const stateTransitionsCount: number[] = []

  for (const stateTransitions of transitions) {
    const trCount = stateTransitions.filter((transition) => transition.targetState !== null).length
    stateTransitionsCount.push(trCount)

    for (const transition of stateTransitions) {
      if (transition.targetState === null) continue

      const { instructions, heap } = compileParsedConditions(transition.conditions, fields, stringInterner)
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
    const trCount = stateTransitions.filter((transition) => transition.targetState !== null).length
    const nullCount = stateTransitions.filter((transition) => transition.targetState === null).length
    return sum + 1 + trCount * 2 + nullCount * 2
  }, 0)
  const condBlocksStart = stateTableLength + stateBlocksLength
  const condBlockSizes = condBlocksData.map((block) => block.instructions.length + block.heap.length)

  const statePtrs: number[] = []
  const stateBlocks: number[] = []

  let condBlockIdx = 0
  let condBlockOffset = condBlocksStart

  for (let stateIndex = 0; stateIndex < numStates; stateIndex++) {
    const stateBlockStart = stateTableLength + stateBlocks.length
    statePtrs.push(stateBlockStart)

    const stateTransitions = transitions[stateIndex]!
    const trCount = stateTransitionsCount[stateIndex]!
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

function getArrayEncodingContext(ctx: EncodingContext, op: number, fieldType: number): EncodingContext {
  if (fieldType !== TYPE.ARRAY) {
    return ctx
  }

  if (ctx.subType !== undefined && (op === OP.IN || op === OP.NOT_IN)) {
    const nextContext: EncodingContext = { type: ctx.subType }
    if (ctx.stringInterner !== undefined) {
      nextContext.stringInterner = ctx.stringInterner
    }
    return nextContext
  }

  const nextContext: EncodingContext = { type: TYPE.UINT }
  if (ctx.stringInterner !== undefined) {
    nextContext.stringInterner = ctx.stringInterner
  }
  return nextContext
}

export function compileParsedConditions(
  parsedChecks: Array<{ fieldIndex: number; checks: ParsedCheck[] }>,
  fields: Field[],
  stringInterner: StringInterner = createStoredStringInterner(),
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
    const ctx: EncodingContext = { type: check.fieldType, stringInterner }
    const field = fields[check.fieldIndex]
    if (field?.enum !== undefined) {
      ctx.enum = field.enum
    }
    if (field?.elementType !== undefined) {
      switch (field.elementType) {
        case "number":
          ctx.subType = TYPE.FLOAT
          break
        case "string":
          ctx.subType = TYPE.STRING
          break
        case "boolean":
          ctx.subType = TYPE.BOOL
          break
      }
    }

    let valEncoded: number

    if (Array.isArray(check.val) && (check.op === OP.IN || check.op === OP.NOT_IN)) {
      const ptr = heapOffset
      heap.push(check.val.length)
      for (const value of check.val) {
        if (ctx.enum !== undefined && typeof value === "string") {
          const idx = ctx.enum.indexOf(value)
          if (idx === -1) {
            throw new Error(`Value '${value}' not found in enum: [${ctx.enum}]`)
          }
          heap.push(encodeValue(idx, ctx).value1)
        } else {
          heap.push(encodeValue(value, ctx).value1)
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

    const encodeCtx = getArrayEncodingContext(ctx, check.op, check.fieldType)
    let valToEncode = check.val
    if (encodeCtx.enum !== undefined && typeof check.val === "string") {
      const idx = encodeCtx.enum.indexOf(check.val)
      if (idx === -1) {
        throw new Error(`Value '${check.val}' not found in enum: [${encodeCtx.enum}]`)
      }
      valToEncode = idx
    }

    valEncoded = encodeValue(valToEncode, encodeCtx).value1
    instructions.push({
      fieldType: check.fieldType,
      fieldIndex: check.fieldIndex,
      op: check.op,
      valEncoded,
    })
  }

  return { instructions, heap }
}

export function compileConditions(
  conditions: Record<number, any>,
  fields: Field[],
  stringInterner = createStoredStringInterner(),
): CompiledConditionsResult {
  const parsedChecks = Object.entries(conditions).map(([fieldIdxStr, condValue]) => ({
    fieldIndex: Number(fieldIdxStr),
    checks: parseCondition(condValue),
  }))

  return compileParsedConditions(parsedChecks, fields, stringInterner)
}

export function compileEnsemble(
  branes: Array<{ collapses: Collapse[][] }>,
  fields: Field[],
  stringInterner = createStoredStringInterner(),
): CompiledRules {
  const allBytecode: number[] = []
  const offsets: number[] = []

  for (const brane of branes) {
    const { bytecode } = compileSuperposition(brane.collapses, fields, stringInterner)
    offsets.push(allBytecode.length)
    allBytecode.push(...bytecode)
  }

  return {
    bytecode: new Uint32Array(allBytecode),
    bytecodeOffsets: new Uint32Array(offsets),
  }
}

export function compileFlattenedEnsemble(
  branes: Array<{ transitions: FlattenedTransition[][] }>,
  fields: Field[],
  stringInterner = createStoredStringInterner(),
): CompiledRules {
  const allBytecode: number[] = []
  const offsets: number[] = []

  for (const brane of branes) {
    const { bytecode } = compileFlattenedSuperposition(brane.transitions, fields, stringInterner)
    offsets.push(allBytecode.length)
    allBytecode.push(...bytecode)
  }

  return {
    bytecode: new Uint32Array(allBytecode),
    bytecodeOffsets: new Uint32Array(offsets),
  }
}
