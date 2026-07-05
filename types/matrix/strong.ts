import type { MatrixConditionRecord } from "./condition.ts"
import type { MatrixStateRecord, MatrixTransitionRecord } from "./store.ts"

export interface MatrixStrongStore {
  runtimeFieldIndexByWimpFieldId: Map<number, number>
  wimpFieldIdsByRuntimeFieldIndex: number[][]
  braneIndexByWimpFieldId: Map<number, number>
  topologyWimpFieldIds: Set<number>
  runtimeFieldIndexByActorFieldId: Map<string, number>
  actorFieldIdsByRuntimeFieldIndex: Array<Array<[actorId: number, fieldId: number]>>
  topologyActorFieldIds: Set<string>
  reset(): void
}

export interface StringInterner {
  intern(value: string): number
}

export interface MatrixStateGraph {
  stateTable: MatrixStateRecord[]
  transitions: MatrixTransitionRecord[]
  conditions: MatrixConditionRecord[]
}
