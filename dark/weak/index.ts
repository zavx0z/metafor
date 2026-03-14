/**
 * `@dark/weak` — structural transformation path домена Dark.
 *
 * @see {@link weak$} — явный object store
 */

export { weak$ } from "./store.ts"
export type {
  TopologyMutationResult,
  ReplaceFragmentOptions,
  ReplaceFragmentResult,
  RemovePlacementSubtreeOptions,
  RemovePlacementSubtreeResult,
  InsertFragmentAtPlacementOptions,
  InsertFragmentAtPlacementResult,
  MovePlacementOptions,
  MovePlacementResult,
  RebuildFragmentOptions,
  RebuildFragmentResult,
  WeakMutationStore,
} from "./store.t.ts"
