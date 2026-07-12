import type {MatrixInputData} from "./data.ts"
import type {ProcessExecutionId} from "../force/execution.ts"

export const STATE_UNDEFINED = -1
export const STATE_NONE = -2

/** Boundary emits this target-specific derived projection to bootstrap Matrix. */
export const MATRIX_RUNTIME_PATH = "runtime/matrix" as const

export interface MatrixRuntimeActor {
  id: number
  parentActor: number | null
  parentTopology: number | null
  wimp: string
  position: number
}

export interface MatrixRuntimeActorValue {
  actor: number
  field: number
  value: number
}

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

/** One actor is the largest structural entity Boundary exposes incrementally. */
export interface MatrixRuntimeActorEntity {
  actor: MatrixRuntimeActor
  values: MatrixRuntimeActorValue[]
  valueRecords: MatrixRuntimeValueRecord[]
  valueItems: MatrixRuntimeValueItem[]
  state: string | null
}

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
 */
export interface MatrixRuntimeSnapshot {
  ok: true
  version: 1
  runtime: {
    actorIdByBraneIndex: number[]
    braneIndexByActorId: Array<[actorId: number, braneIndex: number]>
    wimpSrcByActorId: Array<[actorId: number, wimpSrc: string]>
    actorIdsByWimpSrc: Array<[wimpSrc: string, actorIds: number[]]>
    /** Canonical Matrix field identity remains the explicit actor/field pair. */
    runtimeFieldIndexByActorFieldId: Array<[actorId: number, fieldId: number, runtimeFieldIndex: number]>
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
    topologyActorFieldIds: Array<[actorId: number, fieldId: number]>
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
