/**
 * `@dark/gravity/store` — singleton store structural state Gravity-layer.
 *
 * Здесь нет assembly-логики. Store держит только промежуточное состояние
 * слоя gravity и узкий store API.
 */

import type { GravityStore } from "./store.t.ts"
import { cloneFragment, cloneGravitySnapshot } from "./snapshot.ts"

export const gravity$: GravityStore = {
  fragments: new Map(),
  nextPlacementSeq: 0,
  nextLinkSeq: 0,
  nextReferenceSeq: 0,
  rootOccurrenceSeq: 0,

  reset() {
    this.fragments = new Map()
    this.nextPlacementSeq = 0
    this.nextLinkSeq = 0
    this.nextReferenceSeq = 0
    this.rootOccurrenceSeq = 0
  },

  restore(snapshot) {
    this.fragments = new Map(Array.from(snapshot.fragments, ([meta, fragment]) => [meta, cloneFragment(fragment)]))
    this.nextPlacementSeq = snapshot.nextPlacementSeq
    this.nextLinkSeq = snapshot.nextLinkSeq
    this.nextReferenceSeq = snapshot.nextReferenceSeq
    this.rootOccurrenceSeq = snapshot.rootOccurrenceSeq
  },

  snapshot() {
    return cloneGravitySnapshot(this)
  },

  setFragment(meta, fragment) {
    const next = cloneFragment(fragment)
    this.fragments.set(meta, next)
    return next
  },

  getFragment(meta) {
    return this.fragments.get(meta)
  },
}
