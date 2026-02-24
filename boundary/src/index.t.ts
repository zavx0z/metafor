/**
 * Типы и интерфейсы для Boundary.
 */

import type { CompiledEnsemble } from "./types"

/**
 * Определение типа поля для GPU.
 * Используется для маппинга в FieldType и выделения памяти.
 *
 * @remarks
 * Это технические типы для GPU, без семантики (required, label).
 * Семантика определяется в monad на уровне Fields.
 */
export type FieldDefinition =
  | { type: "number" }
  | { type: "boolean" }
  | { type: "string" }
  | { type: "array<string>" }
  | { type: "array<number>" }
  | { type: "enum<string>"; values: string[] }
  | { type: "enum<number>"; values: number[] }

export type FieldsDefinition = Record<string, FieldDefinition>

/**
 * Суперпозиция — граф переходов между состояниями.
 *
 * @remarks
 * Ключ верхнего уровня — имя состояния, значение — карта переходов.
 * `null` означает состояние без исходящих переходов (терминальное).
 */
export type Superposition = Record<string, Record<string, any> | null>

/**
 * Брана — возмущение квантовых полей.
 *
 * @remarks
 * Брана содержит:
 * - params — значения полей (данные)
 * - state — текущее состояние (одно из superposition)
 * - superposition — все возможные состояния + граф переходов
 */
export interface BraneDefinition {
  /** Уникальный идентификатор браны. */
  id: string
  /** Значения полей браны (params — данные). */
  params: Record<string, unknown>
  /** Текущее состояние (должно быть в superposition). */
  state: string
  /** Суперпозиция — все состояния + граф переходов. */
  superposition: Superposition
}

/**
 * Опции debug-режима.
 */
export interface DebugOptions {
  /** Включить логирование инициализации полей. */
  fields?: boolean
  /** Включить логирование создания бран. */
  branes?: boolean
  /** Включить логирование компиляции правил. */
  compiler?: boolean
  /** Включить логирование GPU-ресурсов. */
  gpu?: boolean
  /** Включить логирование строкового атласа. */
  strings?: boolean
  /** Включить полное логирование (все категории). */
  all?: boolean
}

/**
 * Конфигурация полевой границы.
 *
 * @remarks
 * Boundary управляет двумя компонентами:
 * - fields — статика: схема типов полей для GPU
 * - branes — динамика: массив бран с params, state, superposition
 */
export interface BoundaryConfig {
  /** Схема типов полей (общая для всех бран). Технические типы для GPU. */
  fields: FieldsDefinition
  /** Массив бран — возмущений в поле. */
  branes: BraneDefinition[]
}

/**
 * Результат инициализации Boundary.
 * Содержит скомпилированные артефакты и метаданные.
 */
export interface BoundaryInitResult {
  /** Скомпилированный ансамбль правил. */
  compiled: CompiledEnsemble
  /** Массив ID созданных бран. */
  braneIds: number[]
}
