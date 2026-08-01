import type {BulkManifest} from "./manifest.ts"
import type {BulkRuntimeProjection} from "./runtime.ts"

export type BulkProjectionDeclarationSection =
  | "meta"
  | "fields"
  | "variants"
  | "states"
  | "transitions"
  | "conditions"
  | "processes"
  | "reactions"
  | "matter"
  | "bulk"

export type BulkProjectionDeclaration = {
  src: string
  section: BulkProjectionDeclarationSection
  localId: string
  value: Record<string, unknown>
}

/** Serializable state from which a browser can continue ordinary Particle updates. */
export type BulkProjectionSnapshot = {
  runtime: BulkRuntimeProjection
  declarations: BulkProjectionDeclaration[]
  /**
   * Applied-change count of the store this snapshot was taken from. Carried so
   * a hydrated store continues the same revision line, and a cache key minted
   * on the server stays comparable against one minted in the browser.
   *
   * Absent on a snapshot captured outside a live store — a recorded fixture, a
   * hand-built test cut — which starts its revision line at zero.
   */
  revision?: number
}

/**
 * Existing observer-readable structural cut. Recursive manifestation is
 * derived from this projection; capture must not introduce another graph.
 *
 * `throughTs` is the authored stamp of the last applied Particle. It is
 * diagnostic only — it is wall-clock and orders nothing across producers.
 */
export type BulkObserverSnapshot = {
  version: 1
  throughTs: number | null
  rootSrc: string
  projection: BulkProjectionSnapshot
}

/** Service-plane response for one observer before its realtime channel opens. */
export type BulkInitialPackage = BulkObserverSnapshot & {
  session: string
  manifest: BulkManifest
}
