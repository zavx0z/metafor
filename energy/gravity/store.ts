import type { EnergyGravityStore } from "./store.t";


export const gravity$: EnergyGravityStore = {
  activeWimpIds: [],
  wimpIdToBraneIndex: new Map(),
  braneIndexToWimpId: [],
  structuralDirty: false,

  hasWimp(wimpId: number): boolean {
    return this.activeWimpIds.includes(wimpId)
  },

  getBraneIndex(wimpId: number): number | undefined {
    return this.wimpIdToBraneIndex.get(wimpId)
  },

  getWimpId(braneIndex: number): number | undefined {
    return this.braneIndexToWimpId[braneIndex]
  },
}
