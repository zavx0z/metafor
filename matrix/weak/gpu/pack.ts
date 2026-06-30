/**
 * `@matrix/weak/gpu/pack` кодирует значения из канонического store в производные execution-формы GPU.
 *
 * Модуль не меняет канонический store и работает только с локальными derived-структурами.
 */

import type { MatrixFieldRecord, MatrixValue } from "../../store.t"
import type { EncodedValue, PackContext } from "./pack.t"
import { FIELD_TYPE, VALUE_TYPE } from "../constants"

export type { EncodedValue, PackContext } from "./pack.t"

/**
 * Преобразует тип поля из канонической схемы в execution-тип Weak.
 */
export function fieldTypeToBytecodeType(fieldType: MatrixFieldRecord["type"]): number {
  switch (fieldType) {
    case FIELD_TYPE.F32:
      return VALUE_TYPE.FLOAT
    case FIELD_TYPE.U32:
      return VALUE_TYPE.UINT
    case FIELD_TYPE.BOOL:
      return VALUE_TYPE.BOOL
    case FIELD_TYPE.STRING_PTR:
      return VALUE_TYPE.STRING
    case FIELD_TYPE.ARRAY_PTR:
      return VALUE_TYPE.ARRAY
    default:
      return VALUE_TYPE.UINT
  }
}

/**
 * Создаёт контекст кодирования для конкретного поля канонической схемы.
 */
export function createPackContext(
  field: MatrixFieldRecord,
  stringTable: string[],
  allocateHeap?: (size: number) => number,
  heap?: Uint32Array,
): PackContext {
  const ctx: PackContext = {
    type: fieldTypeToBytecodeType(field.type),
    stringTable,
  }

  if (allocateHeap !== undefined) {
    ctx.allocateHeap = allocateHeap
  }

  if (heap !== undefined) {
    ctx.heap = heap
  }

  if (field.enum !== undefined) {
    ctx.enum = field.enum
  }

  if (field.elementType !== undefined) {
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

  return ctx
}

/**
 * Кодирует значение из канонического store в производную execution-форму.
 *
 * Это чистая функция: она не меняет канонический store и пишет только в
 * переданные derived-буферы, если они явно указаны в контексте.
 */
export function encodeValue(value: MatrixValue, ctx: PackContext): EncodedValue {
  if (ctx.enum) {
    if (value === null || value === 0) {
      return { value1: 0, value2: 0 }
    }
    if (typeof value === "number") {
      return { value1: value, value2: 0 }
    }
    const idx = ctx.enum.indexOf(value)
    if (idx === -1) {
      throw new Error(`Value '${value}' not found in enum: [${ctx.enum}]`)
    }
    return { value1: idx, value2: 0 }
  }

  if (ctx.type === VALUE_TYPE.FLOAT) {
    const buf = new Float32Array([Number(value)])
    return { value1: new Uint32Array(buf.buffer)[0]!, value2: 0 }
  }

  if (ctx.type === VALUE_TYPE.BOOL) {
    return { value1: value ? 1 : 0, value2: 0 }
  }

  if (ctx.type === VALUE_TYPE.STRING) {
    if (value === null || value === 0) {
      return { value1: 0, value2: 0 }
    }
    if (typeof value === "number") {
      return { value1: value, value2: 0 }
    }
    if (typeof value !== "string") {
      throw new Error(`Expected string for VALUE_TYPE.STRING, got ${typeof value}`)
    }
    return { value1: value as number, value2: 0 }
  }

  if (ctx.type === VALUE_TYPE.ARRAY) {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array for VALUE_TYPE.ARRAY, got ${typeof value}`)
    }
    const arr = value as unknown[]

    if (arr.length === 0) {
      return { value1: 0, value2: 0 }
    }

    if (ctx.allocateHeap && ctx.heap) {
      const arraySize = 1 + arr.length
      const ptr = ctx.allocateHeap(arraySize)

      if (ptr + arraySize > ctx.heap.length) {
        throw new Error(
          `Heap overflow: ARRAY allocation at ${ptr} with size ${arraySize} exceeds heap length ${ctx.heap.length}`,
        )
      }

      ctx.heap[ptr] = arr.length
      const elementType = ctx.subType ?? VALUE_TYPE.FLOAT
      for (let index = 0; index < arr.length; index++) {
        const itemContext: PackContext = { type: elementType, stringTable: ctx.stringTable }
        ctx.heap[ptr + 1 + index] = encodeValue(arr[index] as MatrixValue, itemContext).value1
      }
      return { value1: ptr, value2: 0 }
    }

    return { value1: 0, value2: 0 }
  }

  return { value1: Number(value), value2: 0 }
}
