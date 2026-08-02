import type {BulkManifest} from "./manifest.ts"
import type {BulkRuntimeProjection} from "./runtime.ts"
import type {
  BulkVisualLayoutSlug,
  BulkVisualSourceStats,
} from "./visual.ts"

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

/**
 * Compact identity of the ready visual cut actually presented by a browser.
 * It contains no Graph, semantic manifestation or projection snapshot.
 */
export type BulkReadySceneSnapshot = {
  kind: "bulk-ready-scene-snapshot"
  version: 1
  throughTs: number | null
  rootSrc: string
  visual: {
    layoutSlug: BulkVisualLayoutSlug
    sourceStats: BulkVisualSourceStats
    transitionBatchFingerprints: string[]
    relationBatchFingerprints: string[]
  }
}

/**
 * Projection-based recorded/fixture package retained for observer snapshots.
 * Production browser startup uses a ready visual scene instead. This type
 * remains only for recorded semantic fixtures and non-browser observers.
 */
export type BulkInitialPackage = BulkObserverSnapshot & {
  session: string
  manifest: BulkManifest
}
