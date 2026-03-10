import type { ParsedCheck } from "./condition.t"
import type { PreparedEntanglementProjection } from "./entangled.t"
import type { BraneValue, Field } from "./index.t"

/**
 * Canonical stored string table.
 *
 * Index in `values` is the stable string ID used by heap and bytecode.
 */
export interface StoredStringTable {
  values: string[]
}

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

/**
 * Canonical metadata for one stored field.
 */
export interface StoredFieldMeta {
  fieldIndex: number
  fieldType: number
  fieldSize: number
}

/**
 * Canonical encoded entangled block.
 */
export interface StoredEntangledBlock {
  key: string
  fields: [number, number][]
}

/**
 * Canonical stored contract between Fields and Matrix.
 *
 * This is flat, indexed, deduplicated, and backend-neutral.
 */
export interface StoredBoundaryData {
  fieldMeta: StoredFieldMeta[]
  localFields: [number, number][][]
  braneEntangledMap: number[][]
  entangledFields: StoredEntangledBlock[]
  heap: Uint32Array
  blockPtrs: number[]
  blockSizes: number[]
  bytecode: Uint32Array
  bytecodeOffsets: Uint32Array
  states: Uint32Array
  stringTable: StoredStringTable
  arrayReserveSize: number
}
