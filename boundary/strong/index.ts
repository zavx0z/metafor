/**
 * `@boundary/strong` удерживает каноническую и согласованную store-форму Boundary.
 */

import { materializeEntanglement } from "./entangled"
import type { PreparedEntanglementProjection } from "./entangled.t"
import { assembleStoredBoundaryData } from "./stored"
import type { FlattenedBoundaryInput } from "@boundary/gravity"
import { createStoredStringInterner } from "./string-table"
import type { StoredStringTable } from "./string-table.t"
import { normalizeFieldValue } from "./normalize"
import { strong$ } from "./store"
import type { BoundaryStrongStore } from "./store.t"
import type { PreparedData } from "../boundary.t"

export {
  assembleStoredBoundaryData,
  createStoredStringInterner,
  materializeEntanglement,
  normalizeFieldValue,
  strong$,
}
export type {
  FlattenedBoundaryInput,
  PreparedEntanglementProjection,
  StoredStringTable,
  BoundaryStrongStore,
  PreparedData,
}
export { FieldType } from "@boundary/gravity"
