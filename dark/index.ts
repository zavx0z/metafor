/**
 * `@metafor/dark` — owner meta/atom store domain.
 *
 * @packageDocumentation
 */

export { dark$ } from "./store"
export { load } from "./dark"
export { loadMetaAST } from "./load"
export { projectDarkGraph, projectDarkGraphToBoundary, projectDarkGraphToBulk } from "./em"
export type { Atom, DarkStore, DarkStoreSnapshot } from "./store"
export type { DarkConsumer, DarkDownstreamProjection } from "./em"
