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
}

/**
 * Existing observer-readable structural cut. Recursive manifestation is
 * derived from this projection; capture must not introduce another graph.
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
