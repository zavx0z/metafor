export interface EnergyStrongStore {
  runtimeFieldIndexByWimpFieldId: Map<number, number>
  wimpFieldIdsByRuntimeFieldIndex: number[][]
  braneIndexByWimpFieldId: Map<number, number>
  topologyWimpFieldIds: Set<number>
  reset(): void
}
