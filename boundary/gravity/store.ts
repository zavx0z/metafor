import type { BoundaryGravityStore } from "./store.t";


export const gravity$: BoundaryGravityStore = {
  activeWimpIds: [],
  wimpIdToBraneIndex: new Map(),
  braneIndexToWimpId: [],
  structuralDirty: false,

  hasWimp(wimpId: string): boolean {
    return this.activeWimpIds.includes(wimpId)
  },

  getBraneIndex(wimpId: string): number | undefined {
    return this.wimpIdToBraneIndex.get(wimpId)
  },

  getWimpId(braneIndex: number): string | undefined {
    return this.braneIndexToWimpId[braneIndex]
  },
}
