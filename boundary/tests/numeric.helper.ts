/**
 * Helper для конвертации старого формата суперпозиции в NumericSuperposition.
 * Только для тестов!
 */

import type { NumericSuperposition } from "../src/index.t"

/**
 * Конвертирует старый формат Superposition в NumericSuperposition.
 *
 * @param oldFormat - Старый формат: { IDLE: { PATROL: {...} }, PATROL: null }
 * @returns NumericSuperposition
 */
export function toNumericSuperposition(
  oldFormat: Record<string, Record<string, any> | null>
): NumericSuperposition {
  const states = Object.keys(oldFormat)
  const stateIndex = new Map<string, number>()
  states.forEach((name, i) => stateIndex.set(name, i))

  const transitions: Array<Array<{ to: number; conditions: Record<number, any> } | null>> = []

  for (const fromState of states) {
    const transObj = oldFormat[fromState]
    if (!transObj) {
      transitions.push([null])
      continue
    }

    const fromTransitions: Array<{ to: number; conditions: Record<number, any> } | null> = []

    for (const [toState, conditions] of Object.entries(transObj)) {
      const toIdx = stateIndex.get(toState)
      if (toIdx === undefined) continue

      if (!conditions) {
        fromTransitions.push({ to: toIdx, conditions: {} })
      } else {
        // Конвертируем имена полей → индексы
        const converted: Record<number, any> = {}
        for (const [fieldName, cond] of Object.entries(conditions)) {
          converted[Number(fieldName)] = cond
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

/**
 * Создаёт NumericSuperposition из списка состояний и переходов.
 *
 * @example
 * ```ts
 * createNumericSuperposition(
 *   ["IDLE", "PATROL", "DEAD"],
 *   {
 *     IDLE: [{ to: "PATROL", conditions: { 0: { gt: 50 } } }],
 *     PATROL: [],
 *     DEAD: []
 *   }
 * )
 * ```
 */
export function createNumericSuperposition(
  states: string[],
  transitionsDef: Record<string, Array<{ to: string; conditions?: Record<number, any> }>>
): NumericSuperposition {
  const stateIndex = new Map<string, number>()
  states.forEach((name, i) => stateIndex.set(name, i))

  const transitions: Array<Array<{ to: number; conditions: Record<number, any> } | null>> = []

  for (const fromState of states) {
    const defs = transitionsDef[fromState] || []
    if (defs.length === 0) {
      transitions.push([null])
      continue
    }

    const fromTransitions = defs.map((def) => ({
      to: stateIndex.get(def.to)!,
      conditions: def.conditions || {},
    }))

    transitions.push(fromTransitions)
  }

  return { states, transitions }
}
