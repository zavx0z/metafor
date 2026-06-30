/**
 * `@matrix/gravity` раскладывает входную структуру Matrix в адресуемую форму.
 */

import { parseCondition } from "./condition"
import { validateData } from "./validate"
import type { BraneValue, Data } from "./schema.t"
import type { FlattenedMatrixInput } from "./flattened.t"

export function flattenMatrixData(data: Data): FlattenedMatrixInput {
  return {
    fields: [...(data.fields ?? [])],
    branes: (data.branes ?? []).map((brane, braneIndex) => ({
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
      stateNames: data.stateNames?.[braneIndex] ?? [],
    })),
    ...(data.entanglement !== undefined ? { entanglement: data.entanglement } : {}),
  }
}

export { parseCondition, validateData }
export type { Data, FlattenedMatrixInput }
export type { MatrixStore } from "../store.t"
export type { ConditionOperator } from "./condition.t"
export { convertToNumeric } from "./numeric"
export type { NamedSuperposition } from "./numeric"
export type {
  Field,
  Data as MatrixInput,
  Brane,
  Collapse,
  BraneValue,
  FieldTypeValue,
} from "./schema.t"
export type { FlattenedBraneInput, FlattenedFieldChecks, FlattenedTransition } from "./flattened.t"
export { FieldType } from "./schema.t"
