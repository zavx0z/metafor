/**
 * Минимальная монада — конечный автомат для управления состояниями.
 *
 * @packageDocumentation
 */

import type { Superposition, FieldsDefinition } from "@metafor/boundary"

/**
 * Брана — носитель состояния.
 *
 * @remarks
 * Брана содержит:
 * - params — значения полей (данные)
 * - state — текущее состояние (одно из superposition)
 * - superposition — все возможные состояния + граф переходов
 */
export interface Brane {
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
 * Функция обновления параметров браны.
 */
export type Update = (params: Record<string, unknown>) => void

/**
 * Действие — функция, выполняемая при изменении состояния.
 *
 * @param params - Текущие параметры браны.
 * @param update - Функция обновления параметров.
 */
export type Action = (params: Record<string, unknown>, update: Update) => void

/**
 * Карта действий по именам состояний.
 */
export type Actions = Record<string, Action | null>

/**
 * Конфигурация монады (одна брана).
 *
 * @remarks
 * Монада имеет одну брану — проекцию на поверхность Boundary.
 * ID браны генерируется автоматически (UUID монады).
 */
export interface MonadConfig {
  /** Схема типов полей. */
  fields: FieldsDefinition
  /** Значения полей браны. */
  params: Record<string, unknown>
  /** Текущее состояние. */
  state: string
  /** Суперпозиция — граф переходов. */
  superposition: Superposition
  /** Карта действий по именам состояний. */
  actions: Actions
}
