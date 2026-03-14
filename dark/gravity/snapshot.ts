import type { LocalTopologyFragment } from "../../metafor/dsl/topology.t.ts"
import type { GravityStoreSnapshot } from "./store.t.ts"

function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

function cloneFragments(source: ReadonlyMap<string, LocalTopologyFragment>): Map<string, LocalTopologyFragment> {
  return new Map(Array.from(source, ([key, value]) => [key, cloneValue(value)]))
}

export function cloneGravitySnapshot(snapshot: GravityStoreSnapshot): GravityStoreSnapshot {
  return {
    fragments: cloneFragments(snapshot.fragments),
    nextPlacementSeq: snapshot.nextPlacementSeq,
    nextLinkSeq: snapshot.nextLinkSeq,
    nextReferenceSeq: snapshot.nextReferenceSeq,
    rootOccurrenceSeq: snapshot.rootOccurrenceSeq,
  }
}

export function cloneFragment(fragment: LocalTopologyFragment): LocalTopologyFragment {
  return cloneValue(fragment)
}
