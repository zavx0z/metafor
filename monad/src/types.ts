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
 *
 * @param boundaryId - Идентификатор boundary (монады).
 * @param params - Новые значения полей.
 */
export type Update = (boundaryId: string, params: Record<string, unknown>) => void

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
 * Конфигурация монады.
 */
export interface MonadConfig {
  /** Схема типов полей (общая для всех бран). */
  fields: FieldsDefinition
  /** Массив бран — возмущений в поле. */
  branes: Brane[]
  /** Карта действий по именам состояний. */
  actions: Actions
}
