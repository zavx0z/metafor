/**
 * `@dark/store` — корневой store домена Dark.
 *
 * Композиция force-split store:
 * - `@dark/strong` — индексы и cohesion
 * - `@dark/gravity` — world assembly
 * - `@dark/weak` — мутации
 *
 * @see {@link dark$} — синглтон dark store
 */

import type { DarkStore } from "./store.t"
export type { DarkStore, DarkStoreSnapshot } from "./store.t"
import { strongIndex$ } from "./strong/index.ts"
import { initGravityStore, topology$ } from "./gravity/index.ts"
import { initWeakMutationStore, weakMutation$ } from "./weak/index.ts"

// Инициализация force-split store
const gravityStore = initGravityStore(strongIndex$)
const weakStore = initWeakMutationStore(gravityStore, strongIndex$)

// Экспорт weak mutation API на topology$ для удобства
Object.assign(topology$, {
  replaceFragment: weakStore.replaceFragment.bind(weakStore),
  removePlacementSubtree: weakStore.removePlacementSubtree.bind(weakStore),
  insertFragmentAtPlacement: weakStore.insertFragmentAtPlacement.bind(weakStore),
  movePlacement: weakStore.movePlacement.bind(weakStore),
  rebuildFragment: weakStore.rebuildFragment.bind(weakStore),
  detachSubtree: weakStore.detachSubtree.bind(weakStore),
  remapPlacementAddresses: weakStore.remapPlacementAddresses.bind(weakStore),
})

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
