import type { DarkGravityStore } from "@dark/types"

export const gravity$: DarkGravityStore = {
  fragments: new Map(),
  nextPlacementSeq: 0,
  nextLinkSeq: 0,
  nextReferenceSeq: 0,
  rootOccurrenceSeq: 0,
}
