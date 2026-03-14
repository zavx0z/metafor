import type { DarkStrongStore } from "@dark/types/strong"
import { cloneStrongSnapshot } from "./snapshot.ts"

export const strong$: DarkStrongStore = {
  placementAddressIndex: new Map(),
  entanglementAddressIndex: new Map(),
  objectPlacementsIndex: new Map(),
  sourceMetaIndex: new Map(),
  metaSourceLookup: new Map(),

  reset() {
    this.placementAddressIndex = new Map()
    this.entanglementAddressIndex = new Map()
    this.objectPlacementsIndex = new Map()
    this.sourceMetaIndex = new Map()
    this.metaSourceLookup = new Map()
  },

  restore(snapshot) {
    const next = cloneStrongSnapshot(snapshot)
    this.placementAddressIndex = next.placementAddressIndex
    this.entanglementAddressIndex = next.entanglementAddressIndex
    this.objectPlacementsIndex = next.objectPlacementsIndex
    this.sourceMetaIndex = next.sourceMetaIndex
    this.metaSourceLookup = next.metaSourceLookup
  },

  snapshot() {
    return cloneStrongSnapshot(this)
  },
}
