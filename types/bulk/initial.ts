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
 * diagnostic only — it is wall-clock and orders nothing across producers, so a
 * consumer resuming a stream uses the causal frontier on the initial package
 * instead.
 */
export type BulkObserverSnapshot = {
  version: 1
  throughTs: number | null
  rootSrc: string
  projection: BulkProjectionSnapshot
}

/**
 * Canonical causal cursor for one observed stream.
 *
 * `cutId` names the checkpoint cut and `acceptanceSequence` is the monotonic
 * ordinal Dark assigns where a delivery is accepted. Together they totally
 * order everything a consumer has seen, which an authored `Particle.ts` cannot
 * do — two producers can stamp the same wall-clock millisecond, and a stamp
 * never says whether a change was accepted. A reconnecting consumer reports
 * this pair and receives exactly the deliveries after it.
 */
export type BulkCausalFrontier = {
  acceptanceSequence: number
  cutId: string
}

/** Service-plane response for one observer before its realtime channel opens. */
export type BulkInitialPackage = BulkObserverSnapshot & {
  /** `null` only before a checkpoint session exists; reconnect requires it. */
  frontier: BulkCausalFrontier | null
  session: string
  manifest: BulkManifest
}
