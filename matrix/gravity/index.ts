/**
 * `@matrix/gravity` раскладывает входную структуру Matrix в адресуемую форму.
 */

import { parseCondition } from "./condition"
import { validateData } from "./validate"
import type { FlattenedMatrixInput, MatrixBraneValue, MatrixInputData } from "@metafor/types/matrix/data"

export function flattenMatrixData(data: MatrixInputData): FlattenedMatrixInput {
  return {
    fields: [...(data.fields ?? [])],
    branes: (data.branes ?? []).map((brane, braneIndex) => ({
      values: brane.values.map(([fieldIndex, value]) => [fieldIndex, value] as [number, MatrixBraneValue]),
      state: brane.state,
      transitions: brane.collapses.map((stateTransitions) =>
        stateTransitions.map((collapse) =>
          collapse === null
            ? { targetState: null, conditions: [] }
            : {
                targetState: collapse[0],
                conditions: Object.entries(collapse[1]).map(([fieldIndex, condition]) => ({
                  fieldIndex: Number(fieldIndex),
                  checks: parseCondition(condition),
                })),
              },
        ),
      ),
      stateNames: data.stateNames?.[braneIndex] ?? [],
    })),
    ...(data.entanglement !== undefined ? { entanglement: data.entanglement } : {}),
  }
}

export { parseCondition, validateData }
export { convertToNumeric } from "./numeric"
export { FieldType } from "./schema"
