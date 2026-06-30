/**
 * `@matrix/strong` удерживает каноническую и согласованную store-форму Matrix.
 */

import { materializeEntanglement } from "./entangled"
import type { PreparedEntanglementProjection } from "./entangled.t"
import { assembleStoredMatrixData } from "./stored"
import type { FlattenedMatrixInput } from "@matrix/gravity"
import { createStoredStringInterner } from "./string-table"
import type { StoredStringTable } from "./string-table.t"
import { normalizeFieldValue } from "./normalize"
import { strong$ } from "./store"
import type { MatrixStrongStore } from "./store.t"
import type { PreparedData } from "../matrix.t"

export {
  assembleStoredMatrixData,
  createStoredStringInterner,
  materializeEntanglement,
  normalizeFieldValue,
  strong$,
}
export type {
  FlattenedMatrixInput,
  PreparedEntanglementProjection,
  StoredStringTable,
  MatrixStrongStore,
  PreparedData,
}
export { FieldType } from "@matrix/gravity"
