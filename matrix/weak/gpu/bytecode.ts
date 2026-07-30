/**
 * `@matrix/weak/gpu/bytecode` компилирует канонические transitions в производный GPU bytecode.
 *
 * Модуль переводит графы состояний в линейную execution-форму, понятную WebGPU runtime.
 */

import type { GpuFlattenedTransition, GpuPackContext } from "@metafor/types/matrix/gpu"
import type { MatrixCompiledConditionsResult, MatrixConditionInstruction } from "@metafor/types/matrix/condition"
import type { MatrixFieldRecord } from "@metafor/types/matrix/data"
import type { MatrixValue } from "@metafor/types/matrix/store"
import { OP, VALUE_TYPE } from "../constants"
import {compileTransitionLayout} from "../transition-layout"
import { encodeValue, fieldTypeToBytecodeType } from "./pack"

/**
 * Компилирует распарсенные условия в инструкции.
 */
export function compileParsedConditions(
  parsedChecks: Array<{ fieldIndex: number; checks: Array<{ op: number; val: unknown }> }>,
  fields: MatrixFieldRecord[],
  stringTable: string[],
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
    const context: GpuPackContext = { type: check.fieldType, stringTable }
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
          heap.push(encodeValue(value as unknown as MatrixValue, context).value1)
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

function getArrayEncodingContext(ctx: GpuPackContext, op: number, fieldType: number): GpuPackContext {
  if (fieldType !== VALUE_TYPE.ARRAY) {
    return ctx
  }

  if (
    ctx.subType !== undefined &&
    (op === OP.IN || op === OP.NOT_IN || op === OP.INCLUDE || op === OP.NOT_INCLUDE)
  ) {
    const nextContext: GpuPackContext = { type: ctx.subType, stringTable: ctx.stringTable }
    if (ctx.enum !== undefined) {
      nextContext.enum = ctx.enum
    }
    return nextContext
  }

  const nextContext: GpuPackContext = { type: VALUE_TYPE.UINT, stringTable: ctx.stringTable }
  if (ctx.enum !== undefined) {
    nextContext.enum = ctx.enum
  }
  return nextContext
}

/**
 * Компилирует transitions одной браны в bytecode.
 */
export function compileFlattenedSuperposition(
  transitions: GpuFlattenedTransition[][],
  fields: MatrixFieldRecord[],
  stringTable: string[],
): { bytecode: Uint32Array; bytecodeOffset: number } {
  return compileTransitionLayout(transitions, (transition) => {
    const {instructions, heap} = compileParsedConditions(transition.conditions, fields, stringTable)
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

/**
 * Компилирует ансамбль бран в bytecode.
 */
export function compileFlattenedEnsemble(
  branes: Array<{ transitions: GpuFlattenedTransition[][] }>,
  fields: MatrixFieldRecord[],
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
