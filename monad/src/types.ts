/**
 * Типы для Monad.
 *
 * @packageDocumentation
 */

import type { FieldsDefinition, NumericSuperposition } from "@metafor/boundary"

/**
 * Суперпозиция в старом формате (для удобства ввода).
 * Будет автоматически сконвертирована в NumericSuperposition.
 *
 * @example
 * ```typescript
 * {
 *   IDLE: {
 *     PATROL: { hp: { gt: 50 } },  // Переход в PATROL при hp > 50
 *     DEAD: { hp: { lte: 0 } }     // Переход в DEAD при hp <= 0
 *   },
 *   PATROL: null,                   // Терминальное состояние
 *   DEAD: null
 * }
 * ```
 */
export interface LegacySuperposition {
  [state: string]: Record<string, any> | null
}

/**
 * Конфигурация монады.
 *
 * @remarks
 * **Порядок переходов в суперпозиции важен!**
 * Переходы проверяются в порядке объявления ключей.
 * Первый выполненный переход останавливает проверку.
 *
 * @example
 * ```typescript
 * createMonad({
 *   fields: {
 *     hp: { type: "number" },
 *     mana: { type: "number" },
 *     isAlive: { type: "boolean" }
 *   },
 *   params: { hp: 100, mana: 50, isAlive: true },
 *   state: "IDLE",
 *   superposition: {
 *     IDLE: {
 *       PATROL: { hp: { gt: 50 } },   // ← Приоритет 1: hp > 50
 *       DEAD: { hp: { lte: 0 } }      // ← Приоритет 2: hp <= 0
 *     },
 *     PATROL: {
 *       IDLE: { mana: { lt: 10 } },   // mana < 10 → IDLE
 *       COMBAT: { isAlive: true }     // isAlive === true → COMBAT
 *     },
 *     DEAD: null                       // Терминальное состояние
 *   },
 *   actions: {
 *     PATROL: () => console.log("Start patrol"),
 *     DEAD: () => console.log("Unit died")
 *   }
 * })
 * ```
 */
export interface MonadConfig {
  fields: FieldsDefinition
  params: Record<string, unknown>
  state: string
  superposition: LegacySuperposition
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
