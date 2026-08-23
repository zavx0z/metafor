/**
 * Внутренние компиляторы программ переходов слабого слоя.
 *
 * @packageDocumentation
 */

import { parseCondition } from "../gravity/condition"
import type { CompiledRules, FieldBytecode, MatrixEncodingContext } from "@metafor/types/matrix/gpu"
import type { FlattenedTransition, MatrixCollapse, MatrixFieldRecord } from "@metafor/types/matrix/data"
import type {
  MatrixCompiledConditionsResult,
  MatrixConditionInstruction,
  MatrixParsedCheck,
  MatrixQuantifierValue,
} from "@metafor/types/matrix/condition"
import type { StringInterner } from "@metafor/types/matrix/strong"
import { createStoredStringInterner } from "../strong/string-table"
import { OP, VALUE_TYPE } from "./constants"
import { encodeValue, fieldTypeToBytecodeType } from "./encode"
import {compileTransitionLayout} from "./transition-layout"

export function compileSuperposition(
  collapses: MatrixCollapse[][],
  fields: MatrixFieldRecord[],
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
              checks: parseCondition(condValue, fields[Number(fieldIdxStr)]),
            })),
          },
    ),
  )

  return compileFlattenedSuperposition(flattened, fields, stringInterner)
}

export function compileFlattenedSuperposition(
  transitions: FlattenedTransition[][],
  fields: MatrixFieldRecord[],
  stringInterner: StringInterner,
): FieldBytecode {
  return compileTransitionLayout(transitions, (transition) => {
    const {instructions, heap} = compileParsedConditions(transition.conditions, fields, stringInterner)
    return {
      instructions: [
        instructions.length,
        ...instructions.flatMap((instruction) => [
          instruction.fieldType,
          instruction.fieldIndex,
          instruction.op,
          instruction.valEncoded,
        ]),
      ],
      heap,
    }
  })
}

function getArrayEncodingContext(ctx: MatrixEncodingContext, op: number, fieldType: number): MatrixEncodingContext {
  if (fieldType !== VALUE_TYPE.ARRAY) {
    return ctx
  }

  if (
    ctx.subType !== undefined &&
    (op === OP.IN || op === OP.NOT_IN || op === OP.INCLUDE || op === OP.NOT_INCLUDE)
  ) {
    const nextContext: MatrixEncodingContext = { type: ctx.subType }
    if (ctx.stringInterner !== undefined) {
      nextContext.stringInterner = ctx.stringInterner
    }
    return nextContext
  }

  const nextContext: MatrixEncodingContext = { type: VALUE_TYPE.UINT }
  if (ctx.stringInterner !== undefined) {
    nextContext.stringInterner = ctx.stringInterner
  }
  return nextContext
}

function getArrayItemEncodingContext(ctx: MatrixEncodingContext): MatrixEncodingContext {
  const nextContext: MatrixEncodingContext = { type: ctx.subType ?? VALUE_TYPE.FLOAT }
  if (ctx.stringInterner !== undefined) nextContext.stringInterner = ctx.stringInterner
  if (ctx.enum !== undefined) nextContext.enum = ctx.enum
  return nextContext
}

export function compileParsedConditions(
  parsedChecks: Array<{ fieldIndex: number; checks: MatrixParsedCheck[] }>,
  fields: MatrixFieldRecord[],
  stringInterner: StringInterner = createStoredStringInterner(),
): MatrixCompiledConditionsResult {
  const instructions: MatrixConditionInstruction[] = []
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
      throw new Error(`Matrix condition references undefined Field ${fieldIndex}`)
    }
    if (checks.length === 0) {
      throw new Error(`Matrix condition for Field ${fieldIndex} has no checks`)
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
    const ctx: MatrixEncodingContext = { type: check.fieldType, stringInterner }
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

    if (
      Array.isArray(check.val) &&
      (check.op === OP.IN || check.op === OP.NOT_IN || check.op === OP.ARRAY_EQ ||
        check.op === OP.STRING_BETWEEN)
    ) {
      const ptr = heapOffset
      heap.push(check.val.length)
      for (const value of check.val) {
        if (ctx.enum !== undefined && typeof value === "string") {
          const idx = ctx.enum.indexOf(value)
          if (idx === -1) {
            throw new Error(`Value '${value}' not found in enum: [${ctx.enum}]`)
          }
          heap.push(encodeValue(idx, ctx).value1)
        } else if (check.op === OP.ARRAY_EQ) {
          heap.push(encodeValue(value, getArrayItemEncodingContext(ctx)).value1)
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

    if (check.op === OP.EVERY || check.op === OP.SOME) {
      const quantifier = check.val as MatrixQuantifierValue
      const ptr = heapOffset
      const itemContext = getArrayItemEncodingContext(ctx)
      heap.push(quantifier.checks.length)
      for (const itemCheck of quantifier.checks) {
        heap.push(itemCheck.op)
        heap.push(encodeValue(itemCheck.val, itemContext).value1)
      }
      heapOffset += 1 + quantifier.checks.length * 2
      instructions.push({
        fieldType: check.fieldType,
        fieldIndex: check.fieldIndex,
        op: check.op,
        valEncoded: ptr,
      })
      continue
    }

    if (check.op === OP.PATTERN) {
      throw new Error(
        "Pattern must be resolved against the current Matrix Store before WebGPU bytecode compilation",
      )
    }

    const encodeCtx = check.op === OP.RESOLVED
      ? {type: VALUE_TYPE.BOOL, stringInterner}
      : getArrayEncodingContext(ctx, check.op, check.fieldType)
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
  fields: MatrixFieldRecord[],
  stringInterner = createStoredStringInterner(),
): MatrixCompiledConditionsResult {
  const parsedChecks = Object.entries(conditions).map(([fieldIdxStr, condValue]) => ({
    fieldIndex: Number(fieldIdxStr),
    checks: parseCondition(condValue, fields[Number(fieldIdxStr)]),
  }))

  return compileParsedConditions(parsedChecks, fields, stringInterner)
}

export function compileEnsemble(
  branes: Array<{ collapses: MatrixCollapse[][] }>,
  fields: MatrixFieldRecord[],
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
  fields: MatrixFieldRecord[],
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
