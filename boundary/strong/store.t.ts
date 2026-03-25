export interface BoundaryStrongStore {
  runtimeFieldIndexByWimpFieldId: Map<string, number>
  wimpFieldIdsByRuntimeFieldIndex: string[][]
  braneIndexByWimpFieldId: Map<string, number>
  topologyWimpFieldIds: Set<string>
  reset(): void
}
