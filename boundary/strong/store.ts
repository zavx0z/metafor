import type { BoundaryStrongStore } from "./store.t.ts"

export const strong$: BoundaryStrongStore = {
  runtimeFieldIndexByWimpFieldId: new Map(),
  wimpFieldIdsByRuntimeFieldIndex: [],
  braneIndexByWimpFieldId: new Map(),
  topologyWimpFieldIds: new Set(),

  reset() {
    this.runtimeFieldIndexByWimpFieldId.clear()
    this.wimpFieldIdsByRuntimeFieldIndex = []
    this.braneIndexByWimpFieldId.clear()
    this.topologyWimpFieldIds = new Set()
  },
}
