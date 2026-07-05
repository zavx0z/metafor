/**
 * `@matrix/strong` удерживает каноническую и согласованную store-форму Matrix.
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
