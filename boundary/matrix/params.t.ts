/**
 * Типы для модуля params — кодирование значений для GPU.
 * @packageDocumentation
 */

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
  /**
   * Callback для аллокации места в heap (для ARRAY).
   * Возвращает индекс в heap для записи данных массива.
   */
  allocateHeap?: (size: number) => number
  /**
   * Ссылка на heap для записи данных (для ARRAY).
   */
  heap?: Uint32Array
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
