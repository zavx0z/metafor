/** Типы для `@energy/energy/store`. */

import type { ConditionOperator, FieldTypeValue } from "@energy/gravity"

/**
 * Каноническая запись схемы поля, хранящаяся в Energy store.
 *
 * Это единственный источник истины о схеме полей.
 * Все runtime-интерпретации читают схему только отсюда.
 */
export interface EnergyFieldRecord {
  /** Тип поля: `F32`, `U32`, `BOOL`, `STRING_PTR`, `ARRAY_PTR`. */
  type: FieldTypeValue
  /** Тип элементов для `ARRAY_PTR`-поля. */
  elementType?: "number" | "string" | "boolean"
  /** Допустимые enum-значения, если поле ограничено перечислением. */
  enum?: unknown[]
}

export type EnergyScalarValue = number | boolean
export type EnergyValue = EnergyScalarValue | EnergyScalarValue[]

export interface EnergyFieldValueRecord {
  fieldIndex: number
  value: EnergyValue
}

export interface EnergyConditionRecord {
  fieldIndex: number
  op: ConditionOperator
  value: EnergyScalarValue | EnergyScalarValue[]
}

export interface EnergyTransitionRecord {
  targetState: number
  conditionOffset: number
  conditionCount: number
}

export interface EnergyStateRecord {
  transitionOffset: number
  transitionCount: number
}

export interface EnergySharedBlockRecord {
  valueOffset: number
  valueCount: number
}

export interface EnergyBraneRecord {
  localValueOffset: number
  localValueCount: number
  sharedBlockRefOffset: number
  sharedBlockRefCount: number
  stateOffset: number
  stateCount: number
  lock: boolean
}

export type EnergyFieldStorageLocation =
  | { scope: "local"; record: EnergyFieldValueRecord }
  | { scope: "shared"; blockIndex: number; record: EnergyFieldValueRecord }

/**
 * Производное materialized-хранилище Energy.
 *
 * Для слабого вычислительного слоя это рабочий источник истины, но UUID-композиция
 * и `uuid <-> braneIndex` адресация живут отдельно в `gravity$`.
 * Store остаётся плоским, индексным и читаемым в JS и не хранит packed
 * execution layout как каноническую форму.
 */
export interface EnergyData {
  /** Минимальная таблица полей, которую читает слабый вычислительный слой. */
  fields: EnergyFieldRecord[]

  /** Каноническая дедуплицированная таблица строк. Индекс = стабильный string id. */
  stringTable: string[]

  /** Дедуплицированные shared-блоки полей для entangled-бран. */
  sharedBlocks: EnergySharedBlockRecord[]

  /** Shared-значения полей, на которые ссылаются дескрипторы shared-блоков. */
  sharedValues: EnergyFieldValueRecord[]

  /** Плоские записи бран с диапазонами значений, состояний, shared-ссылок и lock-флагом. */
  branes: EnergyBraneRecord[]

  /** Изменяемые локальные значения полей бран. */
  braneValues: EnergyFieldValueRecord[]

  /** Плоские ссылки `brane -> shared block`. */
  braneSharedBlockRefs: number[]

  /** Канонический статический граф состояний, на который браны ссылаются через offsets. */
  stateTable: EnergyStateRecord[]

  /** Каноническая таблица переходов, на которую ссылаются записи состояний. */
  transitions: EnergyTransitionRecord[]

  /** Каноническая таблица условий, на которую ссылаются записи переходов. */
  conditions: EnergyConditionRecord[]

  /** Снимок runtime-состояний, который слабый слой пишет обратно в канонический store. */
  states: number[]

  /**
   * Имена состояний для каждой браны.
   * stateNames[braneIndex][stateIndex] = имя состояния.
   */
  stateNames: string[][]
}

export interface EnergyStore extends EnergyData {
  /** Возвращает запись поля браны независимо от local/shared размещения. */
  getField(braneIndex: number, fieldIndex: number): EnergyFieldValueRecord | undefined

  /** Возвращает фактическое место хранения поля в каноническом store. */
  getFieldLocation(braneIndex: number, fieldIndex: number): EnergyFieldStorageLocation | undefined

  /** Возвращает текущее значение поля браны. */
  getFieldValue(braneIndex: number, fieldIndex: number): EnergyValue | undefined

  /** Возвращает запись состояния внутри state graph конкретной браны. */
  getState(braneIndex: number, stateIndex: number): EnergyStateRecord | undefined

  /** Возвращает имя состояния для данной браны и индекса состояния. */
  getStateName(braneIndex: number, stateIndex: number): string | undefined
}
