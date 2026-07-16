import type {MatrixInputData} from "./data.ts"
import type {ProcessExecutionId} from "../force/execution.ts"

export const STATE_UNDEFINED = -1
export const STATE_NONE = -2

/** Boundary emits this target-specific derived projection to bootstrap Matrix. */
export const MATRIX_RUNTIME_PATH = "runtime/matrix" as const

export interface MatrixRuntimeAtom {
  id: number
  parentActor: number | null
  parentTopology: number | null
  wimp: string
  position: number
}

/** @deprecated Use MatrixRuntimeAtom. */
export type MatrixRuntimeActor = MatrixRuntimeAtom

export interface MatrixRuntimeAtomValue {
  /** Legacy storage key; identifies the materialized Atom. */
  actor: number
  field: number
  value: number
}

/** @deprecated Use MatrixRuntimeAtomValue. */
export type MatrixRuntimeActorValue = MatrixRuntimeAtomValue

export interface MatrixRuntimeValueRecord {
  id: number
  kind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  boolean?: boolean
  number?: number
  text?: string
  variant?: number
}

export interface MatrixRuntimeValueItem {
  value: number
  position: number
  itemValue: string
}

/** One Atom is the largest structural entity Boundary exposes incrementally. */
export interface MatrixRuntimeAtomEntity {
  /** Legacy payload key; the value is the materialized Atom. */
  actor: MatrixRuntimeAtom
  values: MatrixRuntimeAtomValue[]
  valueRecords: MatrixRuntimeValueRecord[]
  valueItems: MatrixRuntimeValueItem[]
  state: string | null
}

/** @deprecated Use MatrixRuntimeAtomEntity. */
export type MatrixRuntimeActorEntity = MatrixRuntimeAtomEntity

export interface MatrixRuntimeTopology {
  id: number
  parentActor: number | null
  parentTopology: number | null
  kind: "fuzzy" | "axion" | "macho"
  position: number
}

/**
 * Derived, target-specific bootstrap projection for the packed Matrix runtime.
 * Boundary remains the canonical world store; this snapshot can always be
 * rebuilt from its current materialization and declarations.
 *
 * The actor-prefixed keys below are retained only as the current wire format.
 * Their IDs identify Atoms.
 */
export interface MatrixRuntimeSnapshot {
  ok: true
  version: 1
  runtime: {
    actorIdByBraneIndex: number[]
    braneIndexByActorId: Array<[atomId: number, braneIndex: number]>
    wimpSrcByActorId: Array<[atomId: number, wimpSrc: string]>
    actorIdsByWimpSrc: Array<[wimpSrc: string, atomIds: number[]]>
    /** Canonical Matrix field identity remains the explicit Atom/Field pair. */
    runtimeFieldIndexByActorFieldId: Array<[atomId: number, fieldId: number, runtimeFieldIndex: number]>
  }
  data: Required<Pick<MatrixInputData, "fields" | "branes" | "stateNames">>
  /**
   * Compact addresses below are scoped to this rebuildable projection. They
   * are not canonical Boundary IDs and may be regenerated with the snapshot.
   */
  strong: {
    runtimeFieldIndexByWimpFieldId: Array<[wimpFieldId: number, runtimeFieldIndex: number]>
    wimpFieldIdsByRuntimeFieldIndex: number[][]
    braneIndexByWimpFieldId: Array<[wimpFieldId: number, braneIndex: number]>
    topologyWimpFieldIds: number[]
    topologyActorFieldIds: Array<[atomId: number, fieldId: number]>
  }
  weak: {
    stateMetaStateIdsByBraneIndex: number[][]
    stateHasProcessByBraneIndex: boolean[][]
  }
}

export type MatrixPendingProcessExecution = {
  braneIndex: number
  stateIndex: number
  processExecutionId: ProcessExecutionId
  fields: Record<string, unknown>
  acceptedEnergy?: string
}

export type AsyncGate = {
  pending: null | Promise<void>
}

export type MatrixUpdateOptions = {
  retriggerProcessStates?: boolean
  skipProcessRetriggerBraneIndexes?: Iterable<number>
}
