/**
 * `@metafor/dark` — owner graph/store/path/address domain.
 *
 * Пакет удерживает `AST`, store of graph structure, linked flat
 * representation и downstream projection contracts для `Boundary` и `Bulk`.
 *
 * Здесь не появляются:
 * - boundary canonicalization и deduplication
 * - boundary transition runtime
 * - bulk process execution
 *
 * @packageDocumentation
 */

export { dark$ } from "./store"
export { load } from "./dark"
export {
  createDarkAddress,
  createDarkPath,
  formatDarkPath,
  parseDarkAddress,
  parseDarkPath,
  buildDarkStoreSnapshot,
} from "./store"
export { projectDarkGraph, projectDarkGraphToBoundary, projectDarkGraphToBulk } from "./em"
export type {
  DarkGraphLookup,
  DarkGraphNode,
  DarkGraphNodeKind,
  DarkGraphPath,
  DarkGraphSection,
  DarkStore,
  DarkStoreInput,
  DarkStoreSnapshot,
} from "./store.t.ts"
export type { DarkConsumer, DarkDownstreamProjection } from "./em"
