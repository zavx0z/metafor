import type { DarkStore } from "./store.t"
export type { DarkStore, DarkStoreSnapshot } from "./store.t"
import { topology$ } from "./ap/store"

export const dark$: DarkStore = {
  meta: new Map(),
  topology: topology$,

  reset() {
    this.meta = new Map()
    this.topology.reset()
  },

  restore(snapshot) {
    this.meta = new Map(snapshot.meta)
    this.topology.restore(snapshot.topology)
  },

  snapshot() {
    return {
      meta: new Map(this.meta),
      topology: this.topology.snapshot(),
    }
  },

  setMeta(address, meta) {
    this.meta.set(address, meta)
    return meta
  },

  getMeta(address) {
    return this.meta.get(address)
  },
}
