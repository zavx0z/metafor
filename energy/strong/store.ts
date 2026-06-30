import type { EnergyStrongStore } from "./store.t.ts"

export const strong$: EnergyStrongStore = {
  runtimeFieldIndexByWimpFieldId: new Map(),
  wimpFieldIdsByRuntimeFieldIndex: [],
  braneIndexByWimpFieldId: new Map(),
  topologyWimpFieldIds: new Set(),
  runtimeFieldIndexByActorFieldId: new Map(),
  actorFieldIdsByRuntimeFieldIndex: [],
  topologyActorFieldIds: new Set(),

  reset() {
    this.runtimeFieldIndexByWimpFieldId.clear()
    this.wimpFieldIdsByRuntimeFieldIndex = []
    this.braneIndexByWimpFieldId.clear()
    this.topologyWimpFieldIds = new Set()
    this.runtimeFieldIndexByActorFieldId.clear()
    this.actorFieldIdsByRuntimeFieldIndex = []
    this.topologyActorFieldIds = new Set()
  },
}
