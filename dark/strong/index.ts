/**
 * `@dark/strong` — graph cohesion и relation retention домена Dark.
 *
 * `strong$` держит индексное промежуточное состояние, а `strong.ts`
 * управляет его обновлением и lookup.
 */

export { strong$ } from "./store.ts"
export {
  getEntanglementIdByAddress,
  getPlacementIdByAddress,
  getPlacementIdsByMeta,
  getPlacementIdsByObject,
  getReferenceIdsBySource,
  hasReferenceBySource,
  indexEntanglement,
  indexObject,
  indexPlacement,
  indexReference,
  isPlacementIndexed,
  removeEntanglementIndexes,
  removeObjectIndex,
  removePlacementIndexes,
  removeReferenceIndexes,
} from "./strong.ts"
export type {
  StrongIndexes,
  StrongIndexStore,
  StrongIndexesSnapshot,
  PlacementLookupResult,
  ReferenceLookupResult,
} from "./store.t.ts"
