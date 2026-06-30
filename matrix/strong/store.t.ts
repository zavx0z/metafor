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
