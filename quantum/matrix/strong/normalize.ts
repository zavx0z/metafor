/**
 * Нормализация входных значений в каноническую числовую и ссылочную форму
 * Matrix Store.
 *
 * @packageDocumentation
 */

import type { MatrixFieldRecord } from "@metafor/types/matrix/data"
import type { MatrixScalarValue, MatrixValue } from "@metafor/types/matrix/store"
import { FieldType } from "../gravity/schema"

/**
 * Нормализует Field до записи Store.
 *
 * F32 округляется один раз через `Math.fround`; U32 принимает только целое
 * число в полном беззнаковом диапазоне; BOOL не принимает числовые заменители.
 * `null` сохраняется отдельно от всех допустимых пустых значений.
 *
 * @throws При отсутствии объявления Field или несовместимом значении.
 *
 * @see [Числовое равенство CPU и WebGPU](https://github.com/zavx0z/metafor/blob/main/matrix/weak/tests/weak.conditions.test.ts)
 */
export function normalizeFieldValue(
  value: unknown,
  field: MatrixFieldRecord | undefined,
  stringInterner: { intern(value: string): number },
): MatrixValue {
  if (!field) {
    throw new Error("Field definition is required for normalization")
  }

  if (value === null) {
    return null
  }

  if (field.enum) {
    return normalizeEnumValue(value, field.enum)
  }

  switch (field.type) {
    case FieldType.F32:
      return normalizeF32(value)
    case FieldType.U32:
      return normalizeU32(value)
    case FieldType.BOOL:
      if (typeof value !== "boolean") {
        throw new Error(`Expected boolean for BOOL, got ${typeof value}`)
      }
      return value
    case FieldType.STRING_PTR:
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
  if (typeof value === "number") {
    const index = normalizeU32(value)
    if (index >= enumValues.length) {
      throw new Error(`Enum index ${index} is outside [0, ${enumValues.length})`)
    }
    return index
  }
  const index = enumValues.indexOf(value)
  if (index === -1) {
    throw new Error(`Value '${String(value)}' not found in enum: [${enumValues}]`)
  }
  return index
}

function normalizeArrayItem(
  value: unknown,
  elementType: MatrixFieldRecord["elementType"],
  stringInterner: { intern(value: string): number },
): MatrixScalarValue {
  switch (elementType) {
    case "boolean":
      if (typeof value !== "boolean") {
        throw new Error(`Expected boolean array item, got ${typeof value}`)
      }
      return value
    case "string":
      if (typeof value !== "string") {
        throw new Error(`Expected string array item, got ${typeof value}`)
      }
      return stringInterner.intern(value)
    case "number":
    default:
      return normalizeF32(value)
  }
}

/** Возвращает конечное значение в точности представления IEEE-754 F32. */
export function normalizeF32(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected finite number for F32, got ${String(value)}`)
  }
  return Math.fround(value)
}

/** Проверяет и возвращает целое значение в диапазоне `0..2^32-1`. */
export function normalizeU32(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 0xffff_ffff
  ) {
    throw new Error(`Expected integer in U32 range, got ${String(value)}`)
  }
  return value
}
