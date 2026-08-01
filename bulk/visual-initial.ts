import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkVisualLayoutSlug} from "@metafor/types/bulk/visual"
import {validateGraph, type Graph} from "@metafor/types/metafor/graph"
import type {ForceMessage} from "shared/protocol/force/message"
import {isBulkBrowserForceMessage} from "./browser-protocol.ts"
import {
  describeVisualPreparedScene,
  isVisualPreparedScene,
  type VisualPreparedScene,
} from "@metafor/visual/layout/centered-nested"
import {
  DEFAULT_BULK_VISUAL_LAYOUT_SLUG,
  buildBulkVisualScenePayload,
  resolveBulkVisualLayout,
} from "./visual-layout.ts"

/**
 * The service-plane response an observer actually receives.
 *
 * Graph is the only complete startup world document. Manifest and prepared
 * Visual state are derived Bulk artifacts, not a second source projection. A
 * browser reading this needs no layout strategy to put a complete scene on
 * screen.
 */
export type BulkGraphScene = Readonly<{
  version: 1
  throughTs: number | null
  rootSrc: string
  graph: Graph
  manifest: BulkManifest
  visual: VisualPreparedScene
}>

/** One observer startup cut plus its one-use WebSocket handoff session. */
export type BulkInitialScene = BulkGraphScene & Readonly<{session: string}>

/** Full validated replacement sent after one causal Graph invalidation. */
export type BulkGraphUpdateControl = Readonly<{
  control: "bulk.graph.update"
  scene: BulkGraphScene
  message: ForceMessage
}>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Closes the browser service-plane discriminator before scene hydration. */
export const isBulkGraphScene = (value: unknown): value is BulkGraphScene => {
  if (!isRecord(value)) return false
  const validation = validateGraph(value.graph)
  return value.version === 1 &&
    (value.throughTs === null || (
      Number.isSafeInteger(value.throughTs) && Number(value.throughTs) >= 0
    )) &&
    typeof value.rootSrc === "string" &&
    value.rootSrc.length > 0 &&
    validation.ok &&
    validation.value.root === value.rootSrc &&
    isRecord(value.manifest) &&
    value.manifest.rootSrc === value.rootSrc &&
    isVisualPreparedScene(value.visual)
}

/** Closes the one-use initial response before browser lifecycle hydration. */
export const isBulkInitialScene = (value: unknown): value is BulkInitialScene =>
  isBulkGraphScene(value) &&
  typeof (value as Record<string, unknown>).session === "string" &&
  ((value as Record<string, unknown>).session as string).length > 0

/** Closes the browser service-plane discriminator before scene hydration. */
export const isBulkGraphUpdateControl = (
  value: unknown,
): value is BulkGraphUpdateControl => {
  if (!isRecord(value) || value.control !== "bulk.graph.update") return false
  return isBulkGraphScene(value.scene) &&
    isBulkBrowserForceMessage(value.message) &&
    value.scene.throughTs === value.message.parts[0].ts
}

/** Declarative visual configuration carried into preparation. */
export type BulkVisualConfiguration = Readonly<{
  layoutSlug: BulkVisualLayoutSlug
}>

export const DEFAULT_BULK_VISUAL_CONFIGURATION: BulkVisualConfiguration =
  Object.freeze({layoutSlug: DEFAULT_BULK_VISUAL_LAYOUT_SLUG})

/**
 * Runs the selected strategy once, on the server, and describes the result as
 * transportable prepared state.
 *
 * This is the only place in the production path where Bulk causes a strategy to
 * run. Everything downstream — hydration, incremental updates — works from the
 * prepared payload.
 */
export const prepareBulkInitialVisual = (
  manifest: BulkManifest,
  projection: BulkRuntimeProjection,
  configuration: BulkVisualConfiguration = DEFAULT_BULK_VISUAL_CONFIGURATION,
): VisualPreparedScene => {
  const layout = resolveBulkVisualLayout(configuration.layoutSlug)
  return describeVisualPreparedScene(
    buildBulkVisualScenePayload(manifest, projection, layout),
  )
}
