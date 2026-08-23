import type { MatrixConditionRecord } from "./condition.ts"
import type { MatrixStateRecord, MatrixTransitionRecord } from "./store.ts"

export interface MatrixStrongStore {
  runtimeFieldIndexByWimpFieldId: Map<number, number>
  wimpFieldIdsByRuntimeFieldIndex: number[][]
  braneIndexByWimpFieldId: Map<number, number>
  topologyWimpFieldIds: Set<number>
  runtimeFieldIndexByAtomFieldId: Map<string, number>
  atomFieldIdsByRuntimeFieldIndex: Array<Array<[atomId: number, fieldId: number]>>
  topologyAtomFieldIds: Set<string>
}

export interface StringInterner {
  intern(value: string): number
}

export interface MatrixStateGraph {
  stateTable: MatrixStateRecord[]
  transitions: MatrixTransitionRecord[]
  conditions: MatrixConditionRecord[]
}
