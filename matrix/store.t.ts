/** Типы для `matrix/store`. */

import type { ConditionOperator, FieldTypeValue } from "@matrix/gravity"

/**
 * Каноническая запись схемы поля, хранящаяся в Matrix store.
 *
 * Это единственный источник истины о схеме полей.
 * Все runtime-интерпретации читают схему только отсюда.
 */
export interface MatrixFieldRecord {
  /** Тип поля: `F32`, `U32`, `BOOL`, `STRING_PTR`, `ARRAY_PTR`. */
  type: FieldTypeValue
  /** Тип элементов для `ARRAY_PTR`-поля. */
  elementType?: "number" | "string" | "boolean"
  /** Допустимые enum-значения, если поле ограничено перечислением. */
  enum?: unknown[]
}

export type MatrixScalarValue = number | boolean
export type MatrixValue = MatrixScalarValue | MatrixScalarValue[]

export interface MatrixFieldValueRecord {
  fieldIndex: number
  value: MatrixValue
}

export interface MatrixConditionRecord {
  fieldIndex: number
  op: ConditionOperator
  value: MatrixScalarValue | MatrixScalarValue[]
}

export interface MatrixTransitionRecord {
  targetState: number
  conditionOffset: number
  conditionCount: number
}

export interface MatrixStateRecord {
  transitionOffset: number
  transitionCount: number
}

export interface MatrixSharedBlockRecord {
  valueOffset: number
  valueCount: number
}

export interface MatrixBraneRecord {
  localValueOffset: number
  localValueCount: number
  sharedBlockRefOffset: number
  sharedBlockRefCount: number
  stateOffset: number
  stateCount: number
  lock: boolean
}

export type MatrixFieldStorageLocation =
  | { scope: "local"; record: MatrixFieldValueRecord }
  | { scope: "shared"; blockIndex: number; record: MatrixFieldValueRecord }

/**
 * Производное materialized-хранилище Matrix.
 *
 * Для слабого вычислительного слоя это рабочий источник истины, но id-композиция
 * и `id <-> braneIndex` адресация живут отдельно в `gravity$`.
 * Store остаётся плоским, индексным и читаемым в JS и не хранит packed
 * execution layout как каноническую форму.
 */
export interface MatrixData {
  /** Минимальная таблица полей, которую читает слабый вычислительный слой. */
  fields: MatrixFieldRecord[]

  /** Каноническая дедуплицированная таблица строк. Индекс = стабильный string id. */
  stringTable: string[]

  /** Дедуплицированные shared-блоки полей для entangled-бран. */
  sharedBlocks: MatrixSharedBlockRecord[]

  /** Shared-значения полей, на которые ссылаются дескрипторы shared-блоков. */
  sharedValues: MatrixFieldValueRecord[]

  /** Плоские записи бран с диапазонами значений, состояний, shared-ссылок и lock-флагом. */
  branes: MatrixBraneRecord[]

  /** Изменяемые локальные значения полей бран. */
  braneValues: MatrixFieldValueRecord[]

  /** Плоские ссылки `brane -> shared block`. */
  braneSharedBlockRefs: number[]

  /** Канонический статический граф состояний, на который браны ссылаются через offsets. */
  stateTable: MatrixStateRecord[]

  /** Каноническая таблица переходов, на которую ссылаются записи состояний. */
  transitions: MatrixTransitionRecord[]

  /** Каноническая таблица условий, на которую ссылаются записи переходов. */
  conditions: MatrixConditionRecord[]

  /** Снимок runtime-состояний, который слабый слой пишет обратно в канонический store. */
  states: number[]

  /**
   * Имена состояний для каждой браны.
   * stateNames[braneIndex][stateIndex] = имя состояния.
   */
  stateNames: string[][]
}

export interface MatrixStore extends MatrixData {
  /** Возвращает запись поля браны независимо от local/shared размещения. */
  getField(braneIndex: number, fieldIndex: number): MatrixFieldValueRecord | undefined

  /** Возвращает фактическое место хранения поля в каноническом store. */
  getFieldLocation(braneIndex: number, fieldIndex: number): MatrixFieldStorageLocation | undefined

  /** Возвращает текущее значение поля браны. */
  getFieldValue(braneIndex: number, fieldIndex: number): MatrixValue | undefined

  /** Возвращает запись состояния внутри state graph конкретной браны. */
  getState(braneIndex: number, stateIndex: number): MatrixStateRecord | undefined

  /** Возвращает имя состояния для данной браны и индекса состояния. */
  getStateName(braneIndex: number, stateIndex: number): string | undefined
}
