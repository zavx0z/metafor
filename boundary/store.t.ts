/**
 * Типы для @boundary/boundary/store.
 *
 * @packageDocumentation
 */

import type { ConditionOperator } from "./fields/condition.t"
import type { FieldTypeValue } from "./fields/index.t"

/**
 * Canonical field schema record stored in Boundary store.
 *
 * Это единственный источник истины о схеме полей.
 * Все runtime интерпретации должны читать из этого record.
 */
export interface BoundaryFieldRecord {
  /** Field type (F32, U32, BOOL, STRING_PTR, ARRAY_PTR). */
  type: FieldTypeValue
  /** Element type for ARRAY_PTR fields. */
  elementType?: "number" | "string" | "boolean"
  /** Optional enum values for constrained fields. */
  enum?: unknown[]
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
  targetState: number
  conditionOffset: number
  conditionCount: number
}

export interface BoundaryStateRecord {
  transitionOffset: number
  transitionCount: number
}

export interface BoundarySharedBlockRecord {
  valueOffset: number
  valueCount: number
}

export interface BoundaryBraneRecord {
  localValueOffset: number
  localValueCount: number
  sharedBlockRefOffset: number
  sharedBlockRefCount: number
  stateOffset: number
  stateCount: number
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

  /** Shared field values referenced by shared block descriptors. */
  sharedValues: BoundaryFieldValueRecord[]

  /** Flat brane records with value/state/shared ranges and runtime lock. */
  branes: BoundaryBraneRecord[]

  /** Mutable brane-local field values. */
  braneValues: BoundaryFieldValueRecord[]

  /** Flat brane -> shared block references. */
  braneSharedBlockRefs: number[]

  /** Canonical static state graph referenced by branes via offsets. */
  stateTable: BoundaryStateRecord[]

  /** Canonical transition table referenced by state records. */
  transitions: BoundaryTransitionRecord[]

  /** Canonical condition table referenced by transition records. */
  conditions: BoundaryConditionRecord[]

  /** Runtime state snapshot written and updated by Matrix. */
  states: number[]
}

export interface BoundaryStore extends BoundaryData {
  reset(): void
  restore(state: BoundaryData): void
}
