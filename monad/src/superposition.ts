/**
 * Конвертация суперпозиций.
 *
 * @packageDocumentation
 */

import type { Superposition } from "@metafor/boundary"

/**
 * Конвертирует суперпозицию из имён полей в индексы.
 *
 * @param superposition - Суперпозиция с именами полей.
 * @param fieldNameIndex - Маппинг имён в индексы.
 * @returns Суперпозиция с индексами полей.
 * @throws {Error} Если поле не найдено в маппинге.
 */
export function convertSuperpositionToIndices(
  superposition: Superposition,
  fieldNameIndex: Map<string, number>
): Superposition {
  const converted: Superposition = {}

  for (const [fromState, transitions] of Object.entries(superposition)) {
    if (!transitions) {
      converted[fromState] = null
      continue
    }

    const convertedTransitions: Record<string, any> = {}
    for (const [toState, conditions] of Object.entries(transitions)) {
      const convertedConditions: Record<string, any> = {}

      for (const [fieldName, condition] of Object.entries(conditions)) {
        const fieldIndex = fieldNameIndex.get(fieldName)
        if (fieldIndex === undefined) {
          throw new Error(`Field '${fieldName}' not found`)
        }
        convertedConditions[fieldIndex] = condition
      }

      convertedTransitions[toState] = convertedConditions
    }

    converted[fromState] = convertedTransitions
  }

  return converted
}
