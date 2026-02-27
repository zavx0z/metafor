/**
 * Типы для API matrix.
 * @packageDocumentation
 */

/**
 * Определение типа поля для GPU.
 */
export const FieldType = {
  F32: 0,
  U32: 1,
  BOOL: 2,
  STRING_PTR: 3,
  ARRAY_PTR: 4,
} as const

export type FieldTypeValue = (typeof FieldType)[keyof typeof FieldType]

/**
 * Поле — схема данных для GPU.
 */
export interface Field {
  type: FieldTypeValue
  elementType?: "number" | "string" | "boolean"
  enum?: any[]
}

/**
 * Collapse — переход между состояниями.
 * Формат: [targetState, conditions] или null для терминального состояния.
 * - targetState: индекс целевого состояния
 * - conditions: Record<fieldIndex, condition>
 */
export type Collapse = [number, Record<number, any>] | null

/**
 * Brane — возмущение квантового поля.
 */
export interface Brane {
  /** Значения полей: [fieldIndex, value][] */
  params: [number, unknown][]
  /** Начальное состояние (индекс). */
  state: number
  /** Граф переходов. */
  collapses: Collapse[][]
}

/**
 * Data — конфигурация для write().
 */
export interface Data {
  /** Поля: [fieldIndex, Field][] */
  fields: [number, Field][]
  /** Браны. */
  branes: Brane[]
}
