import { VALUE_TYPE } from "./constants"
import type { MatrixEncodedValueResult, MatrixEncodingContext } from "@metafor/types/matrix/gpu"
import type { MatrixFieldRecord, MatrixFieldType } from "@metafor/types/matrix/data"
import { FieldType } from "../gravity/schema"

export function createFieldEncodingContext(
  fieldType: number,
  field: MatrixFieldRecord | undefined,
  stringInterner: { intern(value: string): number },
  allocateHeap?: (size: number) => number,
  heap?: Uint32Array,
): MatrixEncodingContext {
  const context: MatrixEncodingContext = {
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

  return context
}

export function encodeValue(value: unknown, context: MatrixEncodingContext): MatrixEncodedValueResult {
  if (context.enum) {
    if (value === null) {
      return { value1: 0, value2: 0 }
    }
    if (typeof value === "number") {
      return { value1: value, value2: 0 }
    }
    const index = context.enum.indexOf(value)
    if (index === -1) {
      throw new Error(`Value '${value}' not found in enum: [${context.enum}]`)
    }
    return { value1: index, value2: 0 }
  }

  if (context.type === VALUE_TYPE.FLOAT) {
    const buffer = new Float32Array([Number(value)])
    return { value1: new Uint32Array(buffer.buffer)[0]!, value2: 0 }
  }

  if (context.type === VALUE_TYPE.BOOL) {
    return { value1: value ? 1 : 0, value2: 0 }
  }

  if (context.type === VALUE_TYPE.STRING) {
    if (value === null) {
      return { value1: 0, value2: 0 }
    }
    if (typeof value === "number") {
      return { value1: value, value2: 0 }
    }
    if (typeof value !== "string") {
      throw new Error(`Expected string for VALUE_TYPE.STRING, got ${typeof value}`)
    }
    if (!context.stringInterner) {
      throw new Error("VALUE_TYPE.STRING encoding requires EncodingContext.stringInterner")
    }
    return {
      value1: context.stringInterner.intern(value),
      value2: 0,
    }
  }

  if (context.type === VALUE_TYPE.ARRAY) {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array for VALUE_TYPE.ARRAY, got ${typeof value}`)
    }
    const items = value as unknown[]

    if (items.length === 0) {
      return { value1: 0, value2: 0 }
    }

    if (context.allocateHeap && context.heap) {
      const arraySize = 1 + items.length
      const pointer = context.allocateHeap(arraySize)

      if (pointer + arraySize > context.heap.length) {
        throw new Error(
          `Heap overflow: ARRAY allocation at ${pointer} with size ${arraySize} exceeds heap length ${context.heap.length}`,
        )
      }

      context.heap[pointer] = items.length
      const elementType = context.subType ?? VALUE_TYPE.FLOAT
      for (let index = 0; index < items.length; index++) {
        const itemContext: MatrixEncodingContext = { type: elementType }
        if (context.stringInterner !== undefined) {
          itemContext.stringInterner = context.stringInterner
        }
        context.heap[pointer + 1 + index] = encodeValue(items[index], itemContext).value1
      }
      return { value1: pointer, value2: 0 }
    }

    return { value1: 0, value2: 0 }
  }

  return { value1: Number(value), value2: 0 }
}

export function encodeFieldValue(value: unknown, context: MatrixEncodingContext): number {
  return encodeValue(value, context).value1
}

export function fieldTypeToBytecodeType(fieldType: MatrixFieldType): number {
  switch (fieldType) {
    case FieldType.F32:
      return VALUE_TYPE.FLOAT
    case FieldType.U32:
      return VALUE_TYPE.UINT
    case FieldType.BOOL:
      return VALUE_TYPE.BOOL
    case FieldType.STRING_PTR:
      return VALUE_TYPE.STRING
    case FieldType.ARRAY_PTR:
      return VALUE_TYPE.ARRAY
    default:
      return VALUE_TYPE.UINT
  }
}

export function floatToUint(value: number): number {
  const buffer = new Float32Array([value])
  return new Uint32Array(buffer.buffer)[0]!
}

export function uintToFloat(value: number): number {
  const buffer = new Uint32Array([value])
  return new Float32Array(buffer.buffer)[0]!
}
