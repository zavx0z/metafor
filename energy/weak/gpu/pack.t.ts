/** Типы для `@energy/weak/gpu/pack`. */

/** Контекст кодирования значения в производную execution-форму GPU. */
export interface PackContext {
  /** Код типа поля для derived packing. */
  type: number
  /** Каноническая таблица строк для перевода string id. */
  stringTable: string[]
  /** Производный heap, если кодирование пишет массив по указателю. */
  heap?: Uint32Array
  /** Аллокатор производного heap для динамических payload. */
  allocateHeap?: (size: number) => number
  /** Enum-таблица поля для стабильного индексирования значений. */
  enum?: unknown[]
  /** Код типа элемента для массива. */
  subType?: number
}

/** Закодированное значение в форме `value1/value2`. */
export interface EncodedValue {
  value1: number
  value2: number
}
