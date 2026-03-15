import type { DarkGravityStore } from "@dark/types"
import { cloneFragment } from "./snapshot.ts"

export const gravity$: DarkGravityStore = {
  fragments: new Map(),
  nextPlacementSeq: 0,
  nextLinkSeq: 0,
  nextReferenceSeq: 0,
  rootOccurrenceSeq: 0,

  setFragment(meta, fragment) {
    const next = cloneFragment(fragment)
    this.fragments.set(meta, next)
    return next
  },

  getFragment(meta) {
    return this.fragments.get(meta)
  },
}
