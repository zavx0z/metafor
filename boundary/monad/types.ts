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
 * Намерение — ключ процесса для выполнения при переходе в состояние.
 *
 * @remarks
 * Намерение указывает, какой процесс должен быть выполнен при переходе в данное состояние.
 * Берётся из DSL-декларации процессов. Не у каждого состояния есть намерение.
 */
export type Intention = string

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
 *   intentions: {
 *     PATROL: "patrolProcess",        // Ключ процесса из DSL
 *     DEAD: "deathProcess"
 *   }
 * })
 * ```
 */
export interface MonadConfig {
  fields: FieldsDefinition
  params: Record<string, unknown>
  state: string
  superposition: Superposition
  intentions?: Intentions
}

/**
 * Функция обновления параметров (не используется в execute).
 */
export type Update = (params: Record<string, unknown>) => void

/**
 * Карта намерений по именам состояний.
 *
 * @remarks
 * Не у каждого состояния есть намерение. Если намерения нет — состояние терминальное или не требует действия.
 */
export type Intentions = Record<string, Intention | null>

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
