/**
 * Типы для Monad.
 *
 * @packageDocumentation
 */

import type { FieldDefinition } from "./field"

/**
 * Карта определений полей для монады.
 */
export type FieldsDefinition = Record<string, FieldDefinition>

/**
 * Суперпозиция — граф переходов между состояниями.
 *
 * @remarks
 * MONAD оперирует именами состояний и полей (семантика).
 * При `updateBoundary()` конвертируется в `NumericSuperposition` для BOUNDARY.
 *
 * @example
 * ```typescript
 * {
 *   IDLE: {
 *     PATROL: { hp: { gt: 50 } },  // Имя поля: hp, имя состояния: PATROL
 *     DEAD: { hp: { lte: 0 } }
 *   },
 *   PATROL: null,
 *   DEAD: null
 * }
 * ```
 */
export interface Superposition {
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
