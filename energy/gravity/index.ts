/**
 * `@energy/gravity` раскладывает входную структуру Energy в адресуемую форму.
 */

import { parseCondition } from "./condition"
import { validateData } from "./validate"
import type { BraneValue, Data } from "./schema.t"
import type { FlattenedEnergyInput } from "./flattened.t"

export function flattenEnergyData(data: Data): FlattenedEnergyInput {
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
export type { Data, FlattenedEnergyInput }
export type { EnergyStore } from "../store.t"
export type { ConditionOperator } from "./condition.t"
export { convertToNumeric } from "./numeric"
export type { NamedSuperposition } from "./numeric"
export type {
  Field,
  Data as EnergyInput,
  Brane,
  Collapse,
  BraneValue,
  FieldTypeValue,
} from "./schema.t"
export type { FlattenedBraneInput, FlattenedFieldChecks, FlattenedTransition } from "./flattened.t"
export { FieldType } from "./schema.t"
