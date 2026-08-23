/**
 * Согласованная производная форма данных Matrix.
 *
 * Слой хранит адреса Fields, States, Transitions и общих значений, на которые
 * опирается вычислительный слой. Каноническим владельцем мира он не является.
 *
 * @see [Локальное изменение общей проекции](https://github.com/zavx0z/metafor/blob/main/quantum/matrix/projection.spec.ts#L91-L188)
 *
 * @packageDocumentation
 */

import { materializeEntanglement } from "./entangled"
import { assembleStoredMatrixData } from "./stored"
import { createStoredStringInterner } from "./string-table"
import { normalizeFieldValue } from "./normalize"
import { strong$ } from "./store"

export {
  assembleStoredMatrixData,
  createStoredStringInterner,
  materializeEntanglement,
  normalizeFieldValue,
  strong$,
}
export { FieldType } from "../gravity/schema"
