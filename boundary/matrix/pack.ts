/**
 * @boundary/matrix/pack — локальное кодирование значений для GPU execution.
 *
 * Этот модуль содержит функции для encoding/packing значений, необходимые
 * для deriveMatrixData и GPU runtime.
 *
 * @packageDocumentation
 */

import { TYPE } from "../fields/opcodes"
import type { BoundaryFieldRecord, BoundaryValue } from "../store.t"
import type { FieldTypeValue } from "../fields/index.t"

/**
 * Encoding context для кодирования значений.
 */
export interface PackContext {
  type: number
  stringTable: string[]
  heap?: Uint32Array
  allocateHeap?: (size: number) => number
  enum?: unknown[]
  subType?: number
}

/**
 * Результат кодирования значения.
 */
export interface EncodedValue {
  value1: number
  value2: number
}

/**
 * fieldTypeToBytecodeType — маппинг field type в bytecode type.
 *
 * Это чистая функция конвертации.
 */
export function fieldTypeToBytecodeType(fieldType: FieldTypeValue): number {
  switch (fieldType) {
    case 0: // FieldType.F32
      return TYPE.FLOAT
    case 1: // FieldType.U32
      return TYPE.UINT
    case 2: // FieldType.BOOL
      return TYPE.BOOL
    case 3: // FieldType.STRING_PTR
      return TYPE.STRING
    case 4: // FieldType.ARRAY_PTR
      return TYPE.ARRAY
    default:
      return TYPE.UINT
  }
}

/**
 * Создать pack context для поля.
 */
export function createPackContext(
  field: BoundaryFieldRecord,
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

  return ctx
}

/**
 * Кодировать значение для GPU heap.
 *
 * Это чистая функция — не мутирует внешнее состояние.
 */
export function encodeValue(value: BoundaryValue, ctx: PackContext): EncodedValue {
  // Enum handling
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

  // Float encoding
  if (ctx.type === TYPE.FLOAT) {
    const buf = new Float32Array([Number(value)])
    return { value1: new Uint32Array(buf.buffer)[0]!, value2: 0 }
  }

  // Bool encoding
  if (ctx.type === TYPE.BOOL) {
    return { value1: value ? 1 : 0, value2: 0 }
  }

  // String encoding (string ID)
  if (ctx.type === TYPE.STRING) {
    if (value === null || value === 0) {
      return { value1: 0, value2: 0 }
    }
    if (typeof value === "number") {
      return { value1: value, value2: 0 }
    }
    if (typeof value !== "string") {
      throw new Error(`Expected string for TYPE.STRING, got ${typeof value}`)
    }
    // Value is already a string ID from canonical store
    return { value1: value as number, value2: 0 }
  }

  // Array encoding
  if (ctx.type === TYPE.ARRAY) {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array for TYPE.ARRAY, got ${typeof value}`)
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
      const elementType = ctx.subType ?? TYPE.FLOAT
      for (let i = 0; i < arr.length; i++) {
        const itemCtx: PackContext = { type: elementType, stringTable: ctx.stringTable }
        ctx.heap[ptr + 1 + i] = encodeValue(arr[i] as BoundaryValue, itemCtx).value1
      }
      return { value1: ptr, value2: 0 }
    }

    return { value1: 0, value2: 0 }
  }

  // Default: numeric value
  return { value1: Number(value), value2: 0 }
}

/**
 * Intern string in local table.
 * Это упрощённая версия для matrix-local string interning.
 */
export function internString(value: string, stringTable: string[]): number {
  const normalized = value.normalize("NFC")
  const existing = stringTable.indexOf(normalized)
  if (existing !== -1) {
    return existing
  }
  const id = stringTable.length
  stringTable.push(normalized)
  return id
}
