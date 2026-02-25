/**
 * Helper utilities for test conversion to tuple format.
 */

import type { FieldTypeValue } from "../src/core/FieldRegistry"
import type { FieldTuple, ValueTuple, Superposition } from "../src/index.t"

/**
 * Convert old-style fields definition to tuple format.
 * @example
 * ```ts
 * const { fields, fieldMap } = convertFields({
 *   hp: { type: FieldType.F32 },
 *   name: { type: FieldType.STRING_PTR }
 * })
 * // fields: [[0, { type: 0 }], [1, { type: 3 }]]
 * // fieldMap: { hp: 0, name: 1 }
 * ```
 */
export function convertFields(
  oldFields: Record<string, { type: FieldTypeValue; options?: { elementType?: string; enumValues?: any[] } }>,
): { fields: FieldTuple[]; fieldMap: Record<string, number> } {
  const fields: FieldTuple[] = []
  const fieldMap: Record<string, number> = {}
  let index = 0

  for (const [name, def] of Object.entries(oldFields)) {
    fieldMap[name] = index
    const field = {
      fieldId: index,
      type: def.type,
      ...(def.options?.elementType !== undefined ? { elementType: def.options.elementType } : {}),
      ...(def.options?.enumValues !== undefined ? { enumValues: def.options.enumValues } : {}),
    }
    fields.push([index, field])
    index++
  }

  return { fields, fieldMap }
}

/**
 * Convert old-style params to tuple format.
 * @example
 * ```ts
 * const params = convertParams({ hp: 100, name: "Arthur" }, { hp: 0, name: 1 })
 * // [[0, 100], [1, "Arthur"]]
 * ```
 */
export function convertParams(
  oldParams: Record<string, unknown>,
  fieldMap: Record<string, number>,
): ValueTuple[] {
  const params: ValueTuple[] = []

  for (const [name, value] of Object.entries(oldParams)) {
    const fieldId = fieldMap[name]
    if (fieldId === undefined) {
      throw new Error(`Unknown field: ${name}`)
    }
    params.push([fieldId, value])
  }

  return params
}

/**
 * Convert old-style superposition to tuple format.
 * @example
 * ```ts
 * const superposition = convertSuperposition(
 *   { IDLE: { FIGHT: { hp: { gt: 50 } } }, FIGHT: null },
 *   { hp: 0 }
 * )
 * // { IDLE: { FIGHT: { 0: { gt: 50 } } }, FIGHT: null }
 * ```
 */
export function convertSuperposition(
  oldSuperposition: Record<string, Record<string, any> | null>,
  fieldMap: Record<string, number>,
): Superposition {
  const result: Superposition = {}

  for (const [state, transitions] of Object.entries(oldSuperposition)) {
    if (transitions === null) {
      result[state] = null
      continue
    }

    const newTransitions: Record<string, any> = {}
    for (const [target, conditions] of Object.entries(transitions)) {
      if (conditions === null || conditions === undefined) {
        newTransitions[target] = null
        continue
      }

      const newConditions: Record<string, any> = {}
      for (const [fieldName, condition] of Object.entries(conditions)) {
        const fieldId = fieldMap[fieldName]
        if (fieldId === undefined) {
          throw new Error(`Unknown field in superposition: ${fieldName}`)
        }
        newConditions[fieldId] = condition
      }
      newTransitions[target] = newConditions
    }
    result[state] = newTransitions
  }

  return result
}
