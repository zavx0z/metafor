import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkVisualLayoutSlug} from "@metafor/types/bulk/visual"
import type {ForceMessage} from "shared/protocol/force/message"
import {isBulkBrowserForceMessage} from "./browser-protocol.ts"
import {
  describeVisualPreparedScene,
  isVisualPreparedScene,
  type VisualPreparedScene,
} from "@metafor/visual/layout/centered-nested"
import {
  DEFAULT_BULK_VISUAL_LAYOUT_SLUG,
  adaptBulkReadyVisualRenderManifest,
  buildBulkVisualScenePayload,
  resolveBulkVisualLayout,
} from "./visual-layout.ts"
import {assertBulkVisualProjectionBoundary} from "./web/visual-projection.ts"

/**
 * Complete renderer-ready browser cut. Graph, projection and semantic
 * manifestation stay request-local on the server and never enter this wire.
 */
export type BulkReadyScene = Readonly<{
  kind: "bulk-ready-scene"
  version: 1
  throughTs: number | null
  rootSrc: string
  visual: VisualPreparedScene
}>

/** One observer startup cut plus its one-use WebSocket handoff session. */
export type BulkInitialScene = BulkReadyScene & Readonly<{session: string}>

/** Full validated ready-scene replacement after one causal invalidation. */
export type BulkReadySceneUpdateControl = Readonly<{
  control: "bulk.graph.update"
  scene: BulkReadyScene
  message: ForceMessage
}>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Closes the visual-only browser boundary before scene hydration. */
export const isBulkReadyScene = (value: unknown): value is BulkReadyScene => {
  if (!isRecord(value)) return false
  if (
    value.kind !== "bulk-ready-scene" ||
    value.version !== 1 ||
    "graph" in value ||
    "manifest" in value ||
    !(
      value.throughTs === null ||
      (Number.isSafeInteger(value.throughTs) && Number(value.throughTs) >= 0)
    ) ||
    typeof value.rootSrc !== "string" ||
    value.rootSrc.length === 0 ||
    !isVisualPreparedScene(value.visual) ||
    value.visual.payload.stats.rootSrc !== value.rootSrc
  ) return false
  try {
    assertBulkVisualProjectionBoundary(
      adaptBulkReadyVisualRenderManifest(value.visual.payload),
    )
    return true
  } catch {
    return false
  }
}

/** Closes the one-use initial response before browser lifecycle hydration. */
export const isBulkInitialScene = (value: unknown): value is BulkInitialScene =>
  isBulkReadyScene(value) &&
  typeof (value as Record<string, unknown>).session === "string" &&
  ((value as Record<string, unknown>).session as string).length > 0

/** Closes the browser service-plane discriminator before scene hydration. */
export const isBulkReadySceneUpdateControl = (
  value: unknown,
): value is BulkReadySceneUpdateControl => {
  if (!isRecord(value) || value.control !== "bulk.graph.update") return false
  return isBulkReadyScene(value.scene) &&
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
