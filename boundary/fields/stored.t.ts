import type { ParsedCheck } from "./condition.t"
import type { PreparedEntanglementProjection } from "./entangled.t"
import type { BraneValue, Field } from "./index.t"
import type { StoredStringTable } from "./string-table"

/**
 * Flattened atomic checks for one field.
 *
 * Boundary owns conversion from nested condition objects to this form.
 */
export interface FlattenedFieldChecks {
  fieldIndex: number
  checks: ParsedCheck[]
}

/**
 * Flattened transition edge.
 */
export interface FlattenedTransition {
  targetState: number | null
  conditions: FlattenedFieldChecks[]
}

/**
 * Flattened brane input consumed by Fields.
 */
export interface FlattenedBraneInput {
  values: [number, BraneValue][]
  state: number
  transitions: FlattenedTransition[][]
}

/**
 * Boundary-owned flattened input passed into Fields.
 */
export interface FlattenedBoundaryInput {
  fields: Field[]
  branes: FlattenedBraneInput[]
  entanglement?: PreparedEntanglementProjection
}

export type { StoredStringTable }
