import { OP, TYPE } from "../opcodes"
import { getStringAtlas } from "../strings/StringAtlas"

/**
 * Контекст кодирования для поля.
 */
export interface EncodingContext {
  /** Подтип элемента (для массивов). */
  subType?: number
  /** Значения enum (для enum-типов). */
  enumValues?: any[]
}

/**
 * Кодировщик значений для байт-кода GPU.
 *
 * Преобразует JavaScript-значения в 32-битные целые числа для загрузки на GPU.
 * Поддерживает:
 * - Float32 bitcast для чисел с плавающей точкой
 * - Кодирование enum в индексы
 * - Интернирование строк через StringAtlas
 * - Кодирование массивов для операторов IN/NOT_IN
 *
 * @example
 * ```typescript
 * const encoder = new BytecodeEncoder()
 *
 * // Float bitcast
 * encoder.encodeValue(TYPE.FLOAT, 3.14)
 *
 * // Enum → индекс
 * encoder.encodeValue(TYPE.UINT, "WARRIOR", { enumValues: ["WARRIOR", "MAGE", "ROGUE"] })
 *
 * // String → ID
 * encoder.encodeValue(TYPE.STRING_PTR, "hello")
 * ```
 */
export class BytecodeEncoder {
  /**
   * Кодирует значение в 32-битное целое число.
   *
   * @param inputType - Тип поля (TYPE.FLOAT, TYPE.UINT, ...).
   * @param val - Значение для кодирования.
   * @param contextField - Контекст (subType для массивов, enumValues для enum).
   * @returns Закодированное 32-битное число.
   * @throws {Error} Если значение не найдено в enum.
   *
   * @example
   * ```typescript
   * // Float → bitcast
   * encodeValue(TYPE.FLOAT, 3.14) → 0x4048F5C3
   *
   * // Bool → 0/1
   * encodeValue(TYPE.BOOL, true) → 1
   *
   * // Enum → индекс
   * encodeValue(TYPE.UINT, "MAGE", { enumValues: ["WARRIOR", "MAGE", "ROGUE"] }) → 1
   *
   * // String → ID в StringAtlas
   * encodeValue(TYPE.STRING_PTR, "hello") → 42
   * ```
   */
  encodeValue(
    inputType: number,
    val: any,
    contextField?: EncodingContext,
  ): number {
    // 1. Обработка ENUM: превращаем значение в индекс
    if (contextField?.enumValues) {
      const idx = contextField.enumValues.indexOf(val)
      if (idx === -1) {
        throw new Error(`Value '${val}' not found in enum values: [${contextField.enumValues}]`)
      }
      return idx
    }

    // Если это элемент массива, используем подтип массива как тип значения
    const type = contextField?.subType !== undefined ? contextField.subType : inputType

    // 2. Float → bitcast в Uint32
    if (type === TYPE.FLOAT) {
      const buf = new Float32Array([Number(val)])
      return new Uint32Array(buf.buffer)[0]!
    }

    // 3. Bool → 0/1
    if (type === TYPE.BOOL) {
      return val ? 1 : 0
    }

    // 4. Строки → интернирование через StringAtlas
    if (typeof val === "string") {
      const atlas = getStringAtlas()
      const stringId = atlas.intern(val)
      return stringId
    }

    // 5. UINT / default
    return Number(val)
  }

  /**
   * Кодирует массив значений в кучу для операторов IN/NOT_IN.
   *
   * @param values - Массив значений для кодирования.
   * @param contextField - Контекст кодирования (тип элемента).
   * @returns Массив закодированных 32-битных чисел.
   *
   * @example
   * ```typescript
   * encodeArrayToHeap([1, 2, 3], { subType: TYPE.FLOAT })
   * // → [bitcast(1), bitcast(2), bitcast(3)]
   * ```
   */
  encodeArrayToHeap(values: any[], contextField?: EncodingContext): number[] {
    const encoded: number[] = []
    for (const v of values) {
      encoded.push(this.encodeValue(TYPE.UINT, v, contextField))
    }
    return encoded
  }

  /**
   * Определяет контекст кодирования для оператора.
   *
   * @param field - Информация о поле (type, subType, enumValues).
   * @param op - Оператор (OP.INCLUDE, OP.LENGTH, ...).
   * @returns Контекст кодирования или undefined.
   *
   * @remarks
   * Для массивов:
   * - `INCLUDE`/`NOT_INCLUDE` → используем subType (тип элемента)
   * - `LENGTH`/`IS_EMPTY` → undefined (сравниваем длину как UINT)
   */
  getEncodingContextForOp(
    field: { type: number; subType?: number; enumValues?: any[] },
    op: number,
  ): EncodingContext | undefined {
    // Для массивов: include/notInclude → кодируем в тип элемента
    if (field.type === TYPE.ARRAY) {
      if (op === OP.INCLUDE || op === OP.NOT_INCLUDE) {
        return field
      }
      // Для length/isEmpty → скалярное сравнение (UINT/BOOL)
      return undefined
    }

    return field
  }
}
