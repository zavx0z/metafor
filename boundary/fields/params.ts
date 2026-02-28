/**
 * Кодирование значений для байт-кода GPU.
 *
 * Преобразует JavaScript-значения в 32-битные целые числа для загрузки на GPU.
 * Поддерживает:
 * - Float32 bitcast для чисел с плавающей точкой
 * - Кодирование enum в индексы
 * - Интернирование строк через StringAtlas (возвращает string_id + hash)
 * - Кодирование массивов (возвращает pointer в heap)
 *
 * @packageDocumentation
 */

import { TYPE } from "./opcodes"
import { FieldType, type FieldTypeValue } from "./index.t"
import { getStringAtlas } from "@boundary/atlas"
import type { EncodingContext } from "./params.t"

/**
 * Результат кодирования значения.
 * Для скаляров value2 = 0, для STRING/ARRAY value2 содержит hash/reserved.
 */
export interface EncodedValueResult {
  /** Первое слово: encoded value (scalar, string_id, pointer). */
  value1: number
  /** Второе слово: 0 для скаляров, hash для STRING, reserved для ARRAY. */
  value2: number
}

/**
 * Кодирует значение в пару 32-битных целых чисел для GPU.
 *
 * ## Side Effects
 *
 * **Для TYPE.STRING:** Вызывает `getStringAtlas().intern()` — изменяет глобальное состояние атласа.
 * **Для TYPE.ARRAY:** Может изменять heap при аллокации (в `encodeFieldUpdate()`).
 *
 * **Нарушение fp.md п.1:** Эта функция **не является чистой** из-за интернирования строк.
 *
 * ## Где использовать
 *
 * - ✅ Внутри `prepareData()` — для кодирования начальных значений
 * - ✅ Внутри `encodeFieldUpdate()` — для кодирования обновлений
 * - ❌ В чистых функциях — может вызвать неожиданные side effects
 *
 * @param value - Значение для кодирования.
 * @param context - Контекст кодирования (тип, enumValues).
 * @returns EncodedValueResult с value1 и value2.
 * @throws {Error} Если значение не найдено в enum или неверный тип.
 *
 * @example
 * ```typescript
 * // Float → bitcast
 * encodeValue(3.14, { type: TYPE.FLOAT }) → { value1: 0x4048F5C3, value2: 0 }
 *
 * // Bool → 0/1
 * encodeValue(true, { type: TYPE.BOOL }) → { value1: 1, value2: 0 }
 *
 * // Enum → индекс
 * encodeValue("MAGE", { type: TYPE.UINT, enum: ["WARRIOR", "MAGE", "ROGUE"] }) → { value1: 1, value2: 0 }
 *
 * // String → string_id + hash (интернирует строку — side effect!)
 * encodeValue("hello", { type: TYPE.STRING }) → { value1: 42, value2: hash }
 *
 * // Array → pointer + reserved
 * encodeValue([], { type: TYPE.ARRAY }) → { value1: 0, value2: 0 }
 * ```
 */
export function encodeValue(value: unknown, context: EncodingContext): EncodedValueResult {
  // 1. ENUM
  if (context.enum) {
    // Если значение уже число (индекс) — возвращаем его
    if (typeof value === "number") {
      return { value1: value, value2: 0 }
    }
    // Если значение строка — ищем индекс
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
  // Если предоставлен allocateHeap — аллоцируем место и записываем данные
  if (context.type === TYPE.ARRAY) {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array for TYPE.ARRAY, got ${typeof value}`)
    }
    const arr = value as unknown[]

    // Для пустого массива возвращаем pointer=0
    if (arr.length === 0) {
      return { value1: 0, value2: 0 }
    }

    // Если есть allocateHeap и heap — аллоцируем и записываем
    if (context.allocateHeap && context.heap) {
      const arraySize = 1 + arr.length  // [length, item1, item2, ...]
      const ptr = context.allocateHeap(arraySize)

      // Проверка переполнения heap
      if (ptr + arraySize > context.heap.length) {
        throw new Error(
          `Heap overflow: ARRAY allocation at ${ptr} with size ${arraySize} exceeds heap length ${context.heap.length}`
        )
      }

      // Записываем длину
      context.heap[ptr] = arr.length
      // Кодируем и записываем элементы
      const elementType = context.subType ?? TYPE.FLOAT
      for (let i = 0; i < arr.length; i++) {
        const itemCtx: EncodingContext = { type: elementType }
        context.heap[ptr + 1 + i] = encodeValue(arr[i], itemCtx).value1
      }
      return { value1: ptr, value2: 0 }
    }

    // Без allocateHeap — возвращаем 0 (данные будут записаны позже через update())
    // Это позволяет использовать write() с пустыми массивами, а update() для инициализации
    return { value1: 0, value2: 0 }
  }

  // 6. UINT / default
  return { value1: Number(value), value2: 0 }
}

/**
 * Закодировать значение поля для heap.
 *
 * @remarks
 * **Чистая функция:** Не имеет side effects.
 *
 * Обёртка над `encodeValue()` для упрощения кодирования полей.
 * Возвращает только `value1` (первое слово encoded значения).
 *
 * @param value - Значение для кодирования
 * @param ctx - Контекст кодирования
 * @returns Закодированное значение (value1 из EncodedValueResult)
 */
export function encodeFieldValue(
  value: unknown,
  ctx: EncodingContext,
): number {
  return encodeValue(value, ctx).value1
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
