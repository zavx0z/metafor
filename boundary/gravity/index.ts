/**
 * `@boundary/gravity` раскладывает входную структуру Boundary в адресуемую форму.
 */

import { parseCondition } from "./condition"
import { validateData } from "./validate"
import type { BraneValue, Data } from "./schema.t"
import type { FlattenedBoundaryInput } from "./flattened.t"

export function flattenBoundaryData(data: Data): FlattenedBoundaryInput {
  return {
    fields: [...(data.fields ?? [])],
    branes: (data.branes ?? []).map((brane) => ({
      values: brane.values.map(([fieldIndex, value]) => [fieldIndex, value] as [number, BraneValue]),
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
    })),
    ...(data.entanglement !== undefined ? { entanglement: data.entanglement } : {}),
  }
}

export { parseCondition, validateData }
export type { Data, FlattenedBoundaryInput }
export { convertToNumeric } from "./numeric"
export type { NamedSuperposition } from "./numeric"
export type {
  Field,
  Data as BoundaryInput,
  Brane,
  Collapse,
  BraneValue,
  FieldTypeValue,
} from "./schema.t"
export type { FlattenedBraneInput, FlattenedFieldChecks, FlattenedTransition } from "./flattened.t"
export { FieldType } from "./schema.t"
