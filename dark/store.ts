import type { MetaAST } from "@metafor/ast"
import { gravity$ } from "./gravity/store"
import type { GravitySnapshot } from "./gravity/store.t.js"
import type { DarkStore } from "./store.t.js"

export type { Atom, DarkStore, DarkStoreSnapshot } from "./store.t.js"

const state = gravity$.createState<MetaAST>()

/**
 * Primary domain store `Dark`.
 *
 * Публично владеет `meta` и `atom`, а tree-геометрия удерживается в его
 * приватном state, управляемом через gravity-механику.
 */
export const dark$: DarkStore = {
  meta: state.meta,
  atom: state.atom,

  reset() {
    gravity$.reset(state)
  },

  snapshot() {
    return {
      meta: new Map(this.meta),
      atom: new Map(this.atom),
    }
  },

  setMeta(address, meta) {
    this.meta.set(address, meta)
    return meta
  },

  getMeta(address) {
    return this.meta.get(address)
  },

  getAtom(address) {
    return this.atom.get(address)
  },

  getPath(address) {
    return gravity$.getPath(address, state)
  },

  getChildren(parent) {
    return gravity$.getChildren(parent, state)
  },

  getNode(path) {
    return gravity$.getNode(path, state)
  },
}

/** Internal bridge: перенести assembled gravity snapshot в final Dark store. */
export function restoreDarkFromGravity(snapshot: GravitySnapshot<MetaAST>): void {
  gravity$.restore(snapshot, state)
}
