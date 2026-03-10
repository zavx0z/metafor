/**
 * Типы для @boundary/boundary/store.
 *
 * @packageDocumentation
 */

import type { ConditionOperator } from "./fields/condition.t"
import type { FieldTypeValue } from "./fields/index.t"

/**
 * Каноническая запись схемы поля, хранящаяся в Boundary store.
 *
 * Это единственный источник истины о схеме полей.
 * Все runtime-интерпретации читают схему только отсюда.
 */
export interface BoundaryFieldRecord {
  /** Тип поля: `F32`, `U32`, `BOOL`, `STRING_PTR`, `ARRAY_PTR`. */
  type: FieldTypeValue
  /** Тип элементов для `ARRAY_PTR`-поля. */
  elementType?: "number" | "string" | "boolean"
  /** Допустимые enum-значения, если поле ограничено перечислением. */
  enum?: unknown[]
}

export type BoundaryScalarValue = number | boolean
export type BoundaryValue = BoundaryScalarValue | BoundaryScalarValue[]

export interface BoundaryFieldValueRecord {
  fieldIndex: number
  value: BoundaryValue
}

export interface BoundaryConditionRecord {
  fieldIndex: number
  op: ConditionOperator
  value: BoundaryScalarValue | BoundaryScalarValue[]
}

export interface BoundaryTransitionRecord {
  targetState: number
  conditionOffset: number
  conditionCount: number
}

export interface BoundaryStateRecord {
  transitionOffset: number
  transitionCount: number
}

export interface BoundarySharedBlockRecord {
  valueOffset: number
  valueCount: number
}

export interface BoundaryBraneRecord {
  localValueOffset: number
  localValueCount: number
  sharedBlockRefOffset: number
  sharedBlockRefCount: number
  stateOffset: number
  stateCount: number
  lock: boolean
}

/**
 * Каноническое глобальное хранилище Boundary.
 *
 * Это единственный источник истины для Matrix.
 * Store остаётся плоским, индексным и читаемым в JS и не хранит packed
 * execution layout как каноническую форму.
 */
export interface BoundaryData {
  /** Минимальная field metadata table, которую читает Matrix. */
  fields: BoundaryFieldRecord[]

  /** Каноническая дедуплицированная таблица строк. Индекс = стабильный string id. */
  stringTable: string[]

  /** Дедуплицированные shared-блоки полей для entangled-бран. */
  sharedBlocks: BoundarySharedBlockRecord[]

  /** Shared-значения полей, на которые ссылаются дескрипторы shared-блоков. */
  sharedValues: BoundaryFieldValueRecord[]

  /** Плоские записи бран с диапазонами значений, состояний, shared-ссылок и lock-флагом. */
  branes: BoundaryBraneRecord[]

  /** Изменяемые локальные значения полей бран. */
  braneValues: BoundaryFieldValueRecord[]

  /** Плоские ссылки `brane -> shared block`. */
  braneSharedBlockRefs: number[]

  /** Канонический статический граф состояний, на который браны ссылаются через offsets. */
  stateTable: BoundaryStateRecord[]

  /** Каноническая таблица переходов, на которую ссылаются записи состояний. */
  transitions: BoundaryTransitionRecord[]

  /** Каноническая таблица условий, на которую ссылаются записи переходов. */
  conditions: BoundaryConditionRecord[]

  /** Снимок runtime-состояний, который Matrix пишет обратно в канонический store. */
  states: number[]
}

export interface BoundaryStore extends BoundaryData {
  reset(): void
  restore(state: BoundaryData): void
}
