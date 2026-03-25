/**
 * Типы входной boundary-структуры.
 *
 * @packageDocumentation
 *
 * @remarks
 * Поля описывают boundary-схему, которую затем читает слабый слой.
 */

import type { PreparedEntanglementProjection } from "@boundary/strong"

/**
 * Определение типа поля для boundary-схемы.
 *
 * @example
 * ```ts
 * const field: Field = { type: FieldType.F32 }
 * const stringField: Field = { type: FieldType.STRING_PTR }
 * const arrayField: Field = { type: FieldType.ARRAY_PTR, elementType: "number" }
 * ```
 */
export const FieldType = {
  /** 32-битное число с плавающей точкой */
  F32: 0,
  /** 32-битное беззнаковое целое */
  U32: 1,
  /** Булево значение (хранится как 0 или 1) */
  BOOL: 2,
  /** Ссылка на строку в канонической таблице строк */
  STRING_PTR: 3,
  /** Ссылка на массив в вычислительной памяти */
  ARRAY_PTR: 4,
} as const
/**
 * Тип значения FieldType.
 */
export type FieldTypeValue = (typeof FieldType)[keyof typeof FieldType]
/**
 * Допустимые значения поля браны.
 * Union type для строгой типизации.
 */
export type BraneValue =
  | number
  | boolean
  | string
  | null
  | number[]
  | boolean[]
  | string[]

/**
 * Поле — схема данных Boundary.
 *
 * @example
 * ```ts
 * // Простое числовое поле
 * const field: Field = { type: FieldType.F32 }
 *
 * // Поле с enum (строковая типизация)
 * const enumField: Field = {
 *   type: FieldType.U32,
 *   enum: ["idle", "running", "stopped"]
 * }
 *
 * // Массив чисел
 * const arrayField: Field = {
 *   type: FieldType.ARRAY_PTR,
 *   elementType: "number"
 * }
 * ```
 */
export interface Field {
  /** Тип данных поля */
  type: FieldTypeValue
  /** Тип элементов для ARRAY_PTR */
  elementType?: "number" | "string" | "boolean"
  /** Список допустимых значений для enum-полей */
  enum?: any[]
}

/**
 * Collapse — переход между состояниями.
 *
 * Формат: `[targetState, conditions]` или `null` для терминального состояния.
 *
 * - `targetState`: индекс целевого состояния
 * - `conditions`: `Record<fieldIndex, condition>` — условия перехода
 *
 * @example
 * ```ts
 * // Переход в состояние 1 при условии field[0] > 50
 * const collapse: Collapse = [1, { 0: { gt: 50 } }]
 *
 * // Терминальное состояние
 * const terminal: Collapse = null
 * ```
 */
export type Collapse = [number, Record<number, any>] | null

/**
 * Brane — возмущение квантового поля.
 *
 * @example
 * ```ts
 * const brane: Brane = {
 *   values: [[0, 100], [1, true]],  // fieldIndex, value
 *   state: 0,                        // начальное состояние
 *   collapses: [                     // граф переходов
 *     [[1, { 0: { gt: 50 } }]],      // из состояния 0 → 1 при field[0] > 50
 *     [null]                          // состояние 1 терминальное
 *   ]
 * }
 * ```
 */
export interface Brane {
  /** Значения полей: `[fieldIndex, value][]` */
  values: [number, BraneValue][]
  /** Начальное состояние (индекс). */
  state: number
  /** Граф переходов между состояниями. */
  collapses: Collapse[][]
}

/**
 * Data — конфигурация для `write()`.
 *
 * @example
 * ```ts
 * const data: Data = {
 *   fields: [
 *     { type: FieldType.F32 },
 *     { type: FieldType.BOOL }
 *   ],
 *   branes: [
 *     {
 *       values: [[0, 100], [1, true]],
 *       state: 0,
 *       collapses: [[[1, { 0: { gt: 50 } }]], [null]]
 *     }
 *   ],
 *   stateNames: [["idle", "running", "stopped"]]
 * }
 * ```
 */
export interface Data {
  /** Поля: индекс = позиция в массиве. Может отсутствовать или быть пустым. */
  fields?: Field[]
  /** Браны. Может отсутствовать или быть пустым. */
  branes?: Brane[]
  /**
   * Подготовленная shared-проекция из внешнего pipeline запутанности.
   *
   * Если не передана, Boundary не пытается самостоятельно выводить entanglement
   * из raw values и материализует только локальные поля.
   */
  entanglement?: PreparedEntanglementProjection
  /**
   * Имена состояний для каждой браны.
   * stateNames[braneIndex][stateIndex] = имя состояния.
   */
  stateNames?: string[][]
}
