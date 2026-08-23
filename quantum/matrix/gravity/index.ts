/**
 * Преобразование входной формы Matrix в проверенную адресуемую проекцию.
 *
 * Этот слой разбирает Conditions, сохраняет объявленный порядок Transitions и
 * выпускает плоские записи без выполнения переходов.
 *
 * @see [Пустая запись не сдвигает следующий Transition](https://github.com/zavx0z/metafor/blob/main/matrix/tests/superposition.spec.ts#L135-L161)
 *
 * @packageDocumentation
 */

import { parseCondition } from "./condition"
import { validateData } from "./validate"
import type { FlattenedMatrixInput, MatrixBraneValue, MatrixInputData } from "@matrix/types/data"

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
                  checks: parseCondition(condition, data.fields?.[Number(fieldIndex)]),
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
