/**
 * `@dark/strong` — graph cohesion и relation retention домена Dark.
 *
 * @see {@link strong$} — явный object store
 */

export { strong$, getPlacementIdByAddress, getPlacementIdsByObject, getPlacementIdsByMeta, getReferenceIdsBySource, getEntanglementIdByAddress } from "./store.ts"
export type {
  StrongIndexes,
  StrongIndexesSnapshot,
  StrongIndexStore,
  PlacementLookupResult,
  ReferenceLookupResult,
} from "./store.t.ts"
