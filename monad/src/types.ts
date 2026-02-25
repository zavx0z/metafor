/**
 * Типы для Monad.
 *
 * @packageDocumentation
 */

import type { FieldsDefinition, Superposition } from "@metafor/boundary"

/**
 * Конфигурация монады.
 */
export interface MonadConfig {
  fields: FieldsDefinition
  params: Record<string, unknown>
  state: string
  superposition: Superposition
  actions: Actions
}

/**
 * Функция обновления параметров (не используется в execute).
 */
export type Update = (params: Record<string, unknown>) => void

/**
 * Действие — функция, выполняемая при изменении состояния.
 */
export type Action = (params: Record<string, unknown>) => void

/**
 * Карта действий по именам состояний.
 */
export type Actions = Record<string, Action | null>

/**
 * Брана — носитель состояния.
 */
export interface Brane {
  /** Значения полей браны (params — данные). */
  params: Record<string, unknown>
  /** Текущее состояние (должно быть в superposition). */
  state: string
  /** Суперпозиция — все состояния + граф переходов. */
  superposition: Superposition
}
