/**
 * Кодирование значений для байт-кода GPU.
 *
 * Преобразует JavaScript-значения в 32-битные целые числа для загрузки на GPU.
 * Поддерживает:
 * - Float32 bitcast для чисел с плавающей точкой
 * - Кодирование enum в индексы
 * - Интернирование строк через StringAtlas (возвращает string_id)
 * - Кодирование массивов (возвращает pointer в heap)
 *
 * @packageDocumentation
 */

import { TYPE } from "./opcodes"
import { FieldType, type FieldTypeValue } from "./index.t"
import { getStringAtlas } from "./StringAtlas"
import type { EncodingContext } from "./params.t"

/**
 * Результат кодирования значения для STRING и ARRAY.
 * Эти типы требуют двух слов: pointer + hash/reserved.
 */
export interface EncodedValueResult {
  /** Первое слово: string_id (для STRING) или pointer в heap (для ARRAY). */
  value1: number
  /** Второе слово: hash (для STRING) или reserved (для ARRAY). */
  value2: number
}

/**
 * Кодирует скалярное значение в 32-битное целое число для GPU.
 *
 * @param value - Значение для кодирования.
 * @param context - Контекст кодирования (тип, enumValues).
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
 * encodeValue("MAGE", { type: TYPE.UINT, enum: ["WARRIOR", "MAGE", "ROGUE"] }) → 1
 * ```
 */
export function encodeValue(value: unknown, context: EncodingContext): number {
  // 1. Обработка ENUM: превращаем значение в индекс
  if (context.enum) {
    // Если значение уже число (индекс), возвращаем его
    if (typeof value === "number") {
      return value
    }
    // Если значение строка — ищем индекс
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

  // 4. UINT / default
  return Number(value)
}

/**
 * Кодирует значение с возвратом двух слов для STRING и ARRAY.
 *
 * @param value - Значение для кодирования.
 * @param context - Контекст кодирования.
 * @returns EncodedValueResult с value1 и value2.
 * @throws {Error} Если значение не найдено в enum или неверный тип.
 *
 * @example
 * ```typescript
 * // String → string_id + hash
 * encodeValueWithPair("hello", { type: TYPE.STRING }) → { value1: 42, value2: hash }
 *
 * // Array → pointer + reserved
 * encodeValueWithPair([], { type: TYPE.ARRAY }) → { value1: 0, value2: 0 }
 * ```
 */
export function encodeValueWithPair(
  value: unknown,
  context: EncodingContext,
): EncodedValueResult {
  // 1. ENUM
  if (context.enum) {
    const idx = context.enum.indexOf(value)
    if (idx === -1) {
      throw new Error(`Value '${value}' not found in enum: [${context.enum}]`)
    }
    return { value1: idx, value2: 0 }
  }

  // 2. FLOAT
  if (context.type === TYPE.FLOAT) {
    const buf = new Float32Array([Number(value)])
    return { value1: new Uint32Array(buf.buffer)[0]!, value2: 0 }
  }

  // 3. BOOL
  if (context.type === TYPE.BOOL) {
    return { value1: value ? 1 : 0, value2: 0 }
  }

  // 4. STRING → string_id + hash
  if (context.type === TYPE.STRING) {
    if (typeof value !== "string") {
      throw new Error(`Expected string for TYPE.STRING, got ${typeof value}`)
    }
    const atlas = getStringAtlas()
    const stringId = atlas.intern(value)
    const meta = atlas.getMeta(stringId)
    return {
      value1: stringId,
      value2: meta ? meta.hash : 0,
    }
  }

  // 5. ARRAY → pointer в heap + reserved (0)
  // Для инициализации params поддерживаем только пустые массивы (pointer=0)
  // Для не-пустых массивов используется update() с аллокацией в heap
  if (context.type === TYPE.ARRAY) {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array for TYPE.ARRAY, got ${typeof value}`)
    }
    const arr = value as unknown[]

    // Для пустого массива возвращаем pointer=0
    if (arr.length === 0) {
      return { value1: 0, value2: 0 }
    }

    // Для не-пустого массива — ошибка, нужно использовать update()
    throw new Error("Non-empty array initialization not supported. Use update() instead.")
  }

  // 6. UINT / default
  return { value1: Number(value), value2: 0 }
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
