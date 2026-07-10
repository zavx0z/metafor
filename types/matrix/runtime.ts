import type { MatrixRuntimeData } from "./data.ts"

export const STATE_UNDEFINED = -1
export const STATE_NONE = -2

export interface MatrixRuntimeSnapshot {
  version: 1
  runtime: {
    actorIdByBraneIndex: number[]
    braneIndexByActorId: Array<[actorId: number, braneIndex: number]>
    wimpSrcByActorId: Array<[actorId: number, wimpSrc: string]>
    actorIdsByWimpSrc: Array<[wimpSrc: string, actorIds: number[]]>
    runtimeFieldIndexByActorFieldId: Array<[actorId: number, fieldId: number, runtimeFieldIndex: number]>
  }
  data: MatrixRuntimeData
  strong: {
    runtimeFieldIndexByWimpFieldId: Array<[number, number]>
    wimpFieldIdsByRuntimeFieldIndex: number[][]
    braneIndexByWimpFieldId: Array<[number, number]>
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
