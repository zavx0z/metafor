/**
 * Конвертация суперпозиций в NumericSuperposition.
 *
 * @packageDocumentation
 */

import type { NumericSuperposition, Transition } from "@metafor/boundary"

/**
 * Старый формат суперпозиции (для ввода пользователем).
 */
export interface LegacySuperposition {
  [fromState: string]: Record<string, any> | null
}

/**
 * Конвертирует старый формат суперпозиции в NumericSuperposition.
 *
 * @param legacy - Старый формат: { IDLE: { PATROL: { hp: { gt: 50 } } }, PATROL: null }
 * @param fieldNameIndex - Маппинг имён полей в индексы.
 * @returns NumericSuperposition с числовыми ID состояний и полей.
 *
 * @example
 * ```typescript
 * const legacy = {
 *   IDLE: { PATROL: { hp: { gt: 50 } } },
 *   PATROL: null
 * }
 * const fieldNameIndex = new Map([["hp", 0]])
 * const numeric = convertToNumeric(legacy, fieldNameIndex)
 * // numeric = {
 * //   states: ["IDLE", "PATROL"],
 * //   transitions: [
 * //     [{ to: 1, conditions: { 0: { gt: 50 } } }],
 * //     [null]
 * //   ]
 * // }
 * ```
 */
export function convertToNumeric(
  legacy: LegacySuperposition,
  fieldNameIndex: Map<string, number>
): NumericSuperposition {
  const states = Object.keys(legacy)
  const stateIndex = new Map<string, number>()
  states.forEach((name, i) => stateIndex.set(name, i))

  const transitions: Array<Array<Transition | null>> = []

  for (const fromState of states) {
    const transObj = legacy[fromState]
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
    transitions,
  }
}
