/**
 * Типы для @boundary/fields/string-table.
 *
 * @packageDocumentation
 */

/** Каноническая таблица строк, где индекс совпадает со стабильным string id. */
export type StoredStringTable = string[]

/** Интерфейс дедупликации строк перед записью в каноническую таблицу. */
export interface StringInterner {
  intern(value: string): number
}
