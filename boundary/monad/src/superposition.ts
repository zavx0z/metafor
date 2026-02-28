/**
 * Конвертация суперпозиций из формата MONAD в формат BOUNDARY.
 *
 * @packageDocumentation
 */

import type { NumericSuperposition, Transition } from "@metafor/boundary"
import type { Superposition } from "./types"

/**
 * Результат конвертации суперпозиции.
 */
export interface ConvertedSuperposition {
  /** Имена состояний для reverse-маппинга (хранятся в Monad). */
  states: string[]
  /** Суперпозиция для Boundary (только индексы). */
  boundary: NumericSuperposition
}

/**
 * Конвертирует суперпозицию уровня MONAD в суперпозицию уровня BOUNDARY.
 *
 * @remarks
 * MONAD оперирует именами состояний и полей (семантика).
 * BOUNDARY оперирует индексами состояний и полей (вычисления).
 *
 * @param superposition - Формат MONAD: { IDLE: { PATROL: { hp: { gt: 50 } } } }
 * @param fieldNameIndex - Маппинг имён полей в индексы.
 * @returns ConvertedSuperposition с states для Monad и boundary для Boundary.
 *
 * @example
 * ```typescript
 * const superposition = {
 *   IDLE: { PATROL: { hp: { gt: 50 } } },
 *   PATROL: null
 * }
 * const fieldNameIndex = new Map([["hp", 0]])
 * const result = convertToNumeric(superposition, fieldNameIndex)
 * // result.states = ["IDLE", "PATROL"]
 * // result.boundary = {
 * //   transitions: [
 * //     [{ to: 1, conditions: { 0: { gt: 50 } } }],
 * //     [null]
 * //   ]
 * // }
 * ```
 */
export function convertToNumeric(
  superposition: Superposition,
  fieldNameIndex: Map<string, number>
): ConvertedSuperposition {
  const states = Object.keys(superposition)
  const stateIndex = new Map<string, number>()
  states.forEach((name, i) => stateIndex.set(name, i))

  const transitions: Array<Array<Transition | null>> = []

  for (const fromState of states) {
    const transObj = superposition[fromState]
    if (!transObj) {
      transitions.push([null])
      continue
    }

    const fromTransitions: Array<Transition | null> = []

    for (const [toState, conditions] of Object.entries(transObj)) {
      const toIdx = stateIndex.get(toState)
      if (toIdx === undefined) {
        throw new Error(`Unknown state: ${toState}`)
      }

      if (!conditions) {
        fromTransitions.push({ to: toIdx, conditions: {} })
      } else {
        // Конвертируем имена полей → индексы
        const converted: Record<number, any> = {}
        for (const [fieldName, cond] of Object.entries(conditions)) {
          const fieldIdx = fieldNameIndex.get(fieldName)
          if (fieldIdx === undefined) {
            throw new Error(`Field '${fieldName}' not found`)
          }
          converted[fieldIdx] = cond
        }
        fromTransitions.push({ to: toIdx, conditions: converted })
      }
    }

    transitions.push(fromTransitions)
  }

  return {
    states,
    boundary: { transitions },
  }
}
