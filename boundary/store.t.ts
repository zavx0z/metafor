/**
 * Типы для @boundary/boundary/store.
 *
 * @packageDocumentation
 */

import type { ConditionOperator } from "./fields/condition.t"
import type { FieldTypeValue } from "./fields/index.t"

export interface BoundaryFieldRecord {
  type: FieldTypeValue
  elementType?: "number" | "string" | "boolean"
}

export type BoundaryScalarValue = number | boolean
export type BoundaryValue = BoundaryScalarValue | BoundaryScalarValue[]

export interface BoundaryFieldValueRecord {
  fieldIndex: number
  value: BoundaryValue
}

export interface BoundaryConditionRecord {
  fieldIndex: number
  op: ConditionOperator
  value: BoundaryScalarValue | BoundaryScalarValue[]
}

export interface BoundaryTransitionRecord {
  targetState: number | null
  conditions: BoundaryConditionRecord[]
}

export interface BoundarySharedBlockRecord {
  fields: BoundaryFieldValueRecord[]
}

export interface BoundaryBraneRecord {
  localFields: BoundaryFieldValueRecord[]
  sharedBlockIds: number[]
  transitions: BoundaryTransitionRecord[][]
  lock: boolean
}

/**
 * Canonical global Boundary store.
 *
 * Это единственный источник истины для Matrix.
 * Store остаётся flat/index-based/readable в JS и не хранит packed
 * execution layout как canonical truth.
 */
export interface BoundaryData {
  /** Минимальная field metadata table, которую читает Matrix. */
  fields: BoundaryFieldRecord[]

  /** Canonical deduplicated string table. Индекс = stable string ID. */
  stringTable: string[]

  /** Deduplicated shared field blocks for entangled branes. */
  sharedBlocks: BoundarySharedBlockRecord[]

  /** Flat brane records with local fields, shared-block refs, transitions, and lock. */
  branes: BoundaryBraneRecord[]

  /** Runtime state snapshot written and updated by Matrix. */
  states: number[]
}

export interface BoundaryStore extends BoundaryData {
  reset(): void
  restore(state: BoundaryData): void
}
