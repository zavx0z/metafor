/**
 * Типы для модуля params — кодирование значений для GPU.
 * @packageDocumentation
 */

import { TYPE } from "./opcodes"
import { FieldType, type FieldTypeValue } from "./index.t"

/**
 * Контекст кодирования для поля.
 * Используется при кодировании значений в байт-код.
 */
export interface EncodingContext {
  /** Тип поля для GPU. */
  type: number
  /** Подтип элемента (для массивов: FLOAT, STRING, etc.). */
  subType?: number
  /** Значения enum (для enum-типов). */
  enum?: any[]
}

/**
 * Результат кодирования значения.
 */
export interface EncodedValue {
  /** Закодированное значение как u32. */
  value: number
  /** Тип значения для шейдера. */
  type: number
}
