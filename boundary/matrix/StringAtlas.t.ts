
/**
 * Идентификатор интернированной строки.
 * Это индекс в stringRegistry, который позволяет быстро получить метаданные строки.
 */
export type StringId = number
/**
 * Метаданные интернированной строки.
 * Хранится в stringRegistry по индексу StringId.
 *
 * Формат: [pointer, length, hash]
 * - pointer: смещение начала строки в stringHeap
 * - length: длина строки в символах (UTF-32 code points)
 * - hash: 32-битный хэш для быстрого сравнения
 */

export interface StringMeta {
  /** Смещение в stringHeap (в u32 словах) */
  pointer: number
  /** Длина строки в символах */
  length: number
  /** FNV-1a 32-битный хэш строки */
  hash: number
}
/**
 * Результат экспорта StringAtlas для GPU.
 * Содержит плоские массивы, готовые к загрузке в storage buffers.
 */

export interface StringAtlasExport {
  /** Реестр строк: плоский массив [ptr0, len0, hash0, ptr1, len1, hash1, ...] */
  registry: Uint32Array
  /** Куча символов: каждый u32 = UTF-32 code point */
  heap: Uint32Array
  /** Количество интернированных строк */
  count: number
}
