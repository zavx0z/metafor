/**
 * Кодирование и нормализация значений.
 *
 * @packageDocumentation
 */

import { TYPE } from "@boundary/matrix"
import type { EncodingContext, EncodedValueResult, NormalizedScalarValue, NormalizedValue } from "./values.t"
import { FieldType, type Field, type FieldTypeValue } from "./index.t"

export function createFieldEncodingContext(
  fieldType: number,
  field: Field | undefined,
  stringInterner: { intern(value: string): number },
  allocateHeap?: (size: number) => number,
  heap?: Uint32Array,
): EncodingContext {
  const context: EncodingContext = {
    type: fieldType,
    stringInterner,
  }

  if (allocateHeap !== undefined) {
    context.allocateHeap = allocateHeap
  }

  if (heap !== undefined) {
    context.heap = heap
  }

  if (field?.enum !== undefined) {
    context.enum = field.enum
  }

  if (field?.elementType !== undefined) {
    switch (field.elementType) {
      case "number":
        context.subType = TYPE.FLOAT
        break
      case "string":
        context.subType = TYPE.STRING
        break
      case "boolean":
        context.subType = TYPE.BOOL
        break
    }
  }

  return context
}

export function normalizeFieldValue(
  value: unknown,
  field: Field | undefined,
  stringInterner: { intern(value: string): number },
): NormalizedValue {
  if (!field) {
    throw new Error("Field definition is required for normalization")
  }

  if (field.enum) {
    return normalizeEnumValue(value, field.enum)
  }

  switch (field.type) {
    case FieldType.F32:
    case FieldType.U32:
      return Number(value)
    case FieldType.BOOL:
      return Boolean(value)
    case FieldType.STRING_PTR:
      if (value === null) {
        return 0
      }
      if (typeof value !== "string") {
        throw new Error(`Expected string for STRING_PTR, got ${typeof value}`)
      }
      return stringInterner.intern(value)
    case FieldType.ARRAY_PTR:
      if (!Array.isArray(value)) {
        throw new Error(`Expected array for ARRAY_PTR, got ${typeof value}`)
      }
      return value.map((item) => normalizeArrayItem(item, field.elementType, stringInterner))
    default:
      return Number(value)
  }
}

function normalizeEnumValue(value: unknown, enumValues: unknown[]): number {
  if (value === null) {
    return 0
  }
  if (typeof value === "number") {
    return value
  }
  const index = enumValues.indexOf(value)
  if (index === -1) {
    throw new Error(`Value '${String(value)}' not found in enum: [${enumValues}]`)
  }
  return index
}

function normalizeArrayItem(
  value: unknown,
  elementType: Field["elementType"],
  stringInterner: { intern(value: string): number },
): NormalizedScalarValue {
  switch (elementType) {
    case "boolean":
      return Boolean(value)
    case "string":
      if (value === null) {
        return 0
      }
      if (typeof value !== "string") {
        throw new Error(`Expected string array item, got ${typeof value}`)
      }
      return stringInterner.intern(value)
    case "number":
    default:
      return Number(value)
  }
}

export function encodeValue(value: unknown, context: EncodingContext): EncodedValueResult {
  if (context.enum) {
    if (value === null) {
      return { value1: 0, value2: 0 }
    }
    if (typeof value === "number") {
      return { value1: value, value2: 0 }
    }
    const idx = context.enum.indexOf(value)
    if (idx === -1) {
      throw new Error(`Value '${value}' not found in enum: [${context.enum}]`)
    }
    return { value1: idx, value2: 0 }
  }

  if (context.type === TYPE.FLOAT) {
    const buf = new Float32Array([Number(value)])
    return { value1: new Uint32Array(buf.buffer)[0]!, value2: 0 }
  }

  if (context.type === TYPE.BOOL) {
    return { value1: value ? 1 : 0, value2: 0 }
  }

  if (context.type === TYPE.STRING) {
    if (value === null) {
      return { value1: 0, value2: 0 }
    }
    if (typeof value === "number") {
      return { value1: value, value2: 0 }
    }
    if (typeof value !== "string") {
      throw new Error(`Expected string for TYPE.STRING, got ${typeof value}`)
    }
    if (!context.stringInterner) {
      throw new Error("TYPE.STRING encoding requires EncodingContext.stringInterner")
    }
    return {
      value1: context.stringInterner.intern(value),
      value2: 0,
    }
  }

  if (context.type === TYPE.ARRAY) {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array for TYPE.ARRAY, got ${typeof value}`)
    }
    const arr = value as unknown[]

    if (arr.length === 0) {
      return { value1: 0, value2: 0 }
    }

    if (context.allocateHeap && context.heap) {
      const arraySize = 1 + arr.length
      const ptr = context.allocateHeap(arraySize)

      if (ptr + arraySize > context.heap.length) {
        throw new Error(
          `Heap overflow: ARRAY allocation at ${ptr} with size ${arraySize} exceeds heap length ${context.heap.length}`,
        )
      }

      context.heap[ptr] = arr.length
      const elementType = context.subType ?? TYPE.FLOAT
      for (let i = 0; i < arr.length; i++) {
        const itemCtx: EncodingContext = { type: elementType }
        if (context.stringInterner !== undefined) {
          itemCtx.stringInterner = context.stringInterner
        }
        context.heap[ptr + 1 + i] = encodeValue(arr[i], itemCtx).value1
      }
      return { value1: ptr, value2: 0 }
    }

    return { value1: 0, value2: 0 }
  }

  return { value1: Number(value), value2: 0 }
}

export function encodeFieldValue(value: unknown, ctx: EncodingContext): number {
  return encodeValue(value, ctx).value1
}

export function fieldTypeToBytecodeType(fieldType: FieldTypeValue): number {
  switch (fieldType) {
    case FieldType.F32:
      return TYPE.FLOAT
    case FieldType.U32:
      return TYPE.UINT
    case FieldType.BOOL:
      return TYPE.BOOL
    case FieldType.STRING_PTR:
      return TYPE.STRING
    case FieldType.ARRAY_PTR:
      return TYPE.ARRAY
    default:
      return TYPE.UINT
  }
}

export function floatToUint(value: number): number {
  const buf = new Float32Array([value])
  return new Uint32Array(buf.buffer)[0]!
}

export function uintToFloat(value: number): number {
  const buf = new Uint32Array([value])
  return new Float32Array(buf.buffer)[0]!
}
