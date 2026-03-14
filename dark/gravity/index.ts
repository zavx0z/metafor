/**
 * `@dark/gravity` — world assembly домена Dark.
 *
 * @see {@link topology$} — синглтон topology store
 * @see {@link initGravityStore} — инициализация с strong index dependency
 */

export { topology$, initGravityStore, createGravityStore } from "./store.ts"
export type {
  GlobalTopologyEntanglement,
  GlobalTopologyIngestOptions,
  GlobalTopologyIngestResult,
  GlobalTopologyLink,
  GlobalTopologyMetaIndex,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
  GlobalTopologySnapshot,
  GlobalTopologyStore,
} from "./store.t.ts"
