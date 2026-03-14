/**
 * `@dark/weak` — structural transformation path домена Dark.
 *
 * Мутации topology объявлены как функции уровня пакета в `weak.ts`.
 */

export {
  detachSubtree,
  insertFragmentAtPlacement,
  movePlacement,
  rebuildFragment,
  remapPlacementAddresses,
  removePlacementSubtree,
  replaceFragment,
} from "./weak.ts"
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
} from "./store.t.ts"
