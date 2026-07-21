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
  | "mass"
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

/** Service-plane response for one observer before its realtime channel opens. */
export type BulkInitialPackage = {
  version: 1
  session: string
  throughTs: number | null
  rootSrc: string
  projection: BulkProjectionSnapshot
  manifest: BulkManifest
}
