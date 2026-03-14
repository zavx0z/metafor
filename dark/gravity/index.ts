/**
 * `@dark/gravity` — world assembly домена Dark.
 *
 * `gravity$` держит промежуточное состояние assembly-слоя.
 */

export { gravity$ } from "./store.ts"
export {
  getChildren,
  getEntanglementByAddress,
  getPlacementByAddress,
  getPlacementsByMeta,
  getPlacementsByObject,
  getReferencesBySource,
} from "./query.ts"
export { ingestFragment } from "./gravity.ts"
export type {
  GlobalTopologyEntanglement,
  GlobalTopologyIngestOptions,
  GlobalTopologyIngestResult,
  GlobalTopologyLink,
  GlobalTopologyMetaIndex,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
  GravityStore,
  GravityStoreSnapshot,
} from "./store.t.ts"
