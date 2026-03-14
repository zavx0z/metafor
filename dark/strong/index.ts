/**
 * `@dark/strong` — graph cohesion и relation retention домена Dark.
 *
 * Ответственность:
 * - индексация placement по адресу и object
 * - индексация reference по source
 * - индексация entanglement по адресу
 * - lookup сущностей по индексам
 * - структурная согласованность индексов
 *
 * @see {@link strongIndex$} — синглтон индексного store
 * @see {@link createStrongIndexStore} — создание нового индексного store
 */

export {
  strongIndex$,
  createStrongIndexStore,
  indexObject,
  removeObjectIndex,
  indexPlacement,
  indexReference,
  indexEntanglement,
  getPlacementIdByAddress,
  getPlacementIdsByObject,
  getPlacementIdsByMeta,
  getReferenceIdsBySource,
  getEntanglementIdByAddress,
} from "./store.ts"
export type {
  StrongIndexes,
  StrongIndexesSnapshot,
  StrongIndexStore,
  PlacementLookupResult,
  ReferenceLookupResult,
} from "./store.t.ts"
