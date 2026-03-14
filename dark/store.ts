/**
 * `@dark/store` — корневой store домена Dark.
 *
 * Композиция force-split store:
 * - `@dark/strong` — индексы и cohesion
 * - `@dark/gravity` — world assembly
 * - `@dark/weak` — мутации
 * - `@dark/em` — проекции
 *
 * @see {@link dark$} — явный domain store
 * @see {@link gravity$} — gravity package store
 * @see {@link strong$} — strong package store
 * @see {@link weak$} — weak package store
 */

import type { DarkStore } from "./store.t"
export type { DarkStore, DarkStoreSnapshot } from "./store.t"
import { gravity$ } from "./gravity/store.ts"
import { strong$ } from "./strong/store.ts"
import { weak$ } from "./weak/store.ts"

/**
 * Явный domain store `@dark`.
 *
 * Композиция package stores:
 * - `meta` — domain-level meta cache
 * - `topology` — unified topology API (gravity + strong + weak)
 */
export const dark$: DarkStore = {
  meta: new Map(),
  topology: gravity$,

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

// Экспорт weak mutation API на topology для удобства
Object.assign(gravity$, {
  replaceFragment: weak$.replaceFragment.bind(weak$),
  removePlacementSubtree: weak$.removePlacementSubtree.bind(weak$),
  insertFragmentAtPlacement: weak$.insertFragmentAtPlacement.bind(weak$),
  movePlacement: weak$.movePlacement.bind(weak$),
  rebuildFragment: weak$.rebuildFragment.bind(weak$),
  detachSubtree: weak$.detachSubtree.bind(weak$),
  remapPlacementAddresses: weak$.remapPlacementAddresses.bind(weak$),
})

// Экспорт package stores
export { gravity$, strong$, weak$ }
