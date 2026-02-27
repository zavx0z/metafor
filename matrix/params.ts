/**
 * Кодирование значений для байт-кода GPU.
 *
 * Преобразует JavaScript-значения в 32-битные целые числа для загрузки на GPU.
 * Поддерживает:
 * - Float32 bitcast для чисел с плавающей точкой
 * - Кодирование enum в индексы
 * - Интернирование строк через StringAtlas
 *
 * @packageDocumentation
 */

import { TYPE } from "./opcodes"
import { FieldType, type FieldTypeValue } from "./index.t"
import { getStringAtlas } from "./StringAtlas"
import type { EncodingContext } from "./params.t"

/**
 * Кодирует значение в 32-битное целое число для GPU.
 *
 * @param value - Значение для кодирования.
 * @param context - Контекст кодирования (тип, enumValues, subType).
 * @returns Закодированное 32-битное число.
 * @throws {Error} Если значение не найдено в enum.
 *
 * @example
 * ```typescript
 * // Float → bitcast
 * encodeValue(3.14, { type: TYPE.FLOAT }) → 0x4048F5C3
 *
 * // Bool → 0/1
 * encodeValue(true, { type: TYPE.BOOL }) → 1
 *
 * // Enum → индекс
 * encodeValue("MAGE", { type: TYPE.UINT, enumValues: ["WARRIOR", "MAGE", "ROGUE"] }) → 1
 *
 * // String → ID в StringAtlas
 * encodeValue("hello", { type: TYPE.STRING }) → 42
 * ```
 */
export function encodeValue(value: unknown, context: EncodingContext): number {
  // 1. Обработка ENUM: превращаем значение в индекс
  if (context.enum) {
    const idx = context.enum.indexOf(value)
    if (idx === -1) {
      throw new Error(`Value '${value}' not found in enum: [${context.enum}]`)
    }
    return idx
  }

  // 2. Float → bitcast в Uint32
  if (context.type === TYPE.FLOAT) {
    const buf = new Float32Array([Number(value)])
    return new Uint32Array(buf.buffer)[0]!
  }

  // 3. Bool → 0/1
  if (context.type === TYPE.BOOL) {
    return value ? 1 : 0
  }

  // 4. Строки → интернирование через StringAtlas
  if (typeof value === "string") {
    const atlas = getStringAtlas()
    const stringId = atlas.intern(value)
    return stringId
  }

  // 5. UINT / default
  return Number(value)
}

/**
 * Преобразует FieldType в TYPE для байт-кода.
 *
 * @param fieldType - Тип поля из FieldType.
 * @returns Код типа для шейдера (TYPE).
 *
 */
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

/**
 * Bitcast: float32 → u32 (для кодирования чисел с плавающей точкой).
 *
 * @param value - Число с плавающей точкой.
 * @returns Битовое представление в виде u32.
 */
export function floatToUint(value: number): number {
  const buf = new Float32Array([value])
  return new Uint32Array(buf.buffer)[0]!
}

/**
 * Bitcast: u32 → float32 (для декодирования чисел из байт-кода).
 *
 * @param value - Битовое представление u32.
 * @returns Число с плавающей точкой.
 */
export function uintToFloat(value: number): number {
  const buf = new Uint32Array([value])
  return new Float32Array(buf.buffer)[0]!
}
