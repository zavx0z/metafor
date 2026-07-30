import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {BulkVisualRenderManifest} from "@metafor/types/bulk/visual"
import {
  buildCenteredNestedBulkVisualManifest,
} from "./visual-layout.ts"

export type BulkVisualViewportProjectionSink = Readonly<{
  applyVisualManifestPatch(projection: BulkVisualRenderManifest): void
}>

/**
 * The single canonical-manifest → Visual-projection → viewport seam used by
 * both initial hydration and every subsequent changed projection.
 */
export const applyCenteredNestedBulkViewportManifest = (
  viewport: BulkVisualViewportProjectionSink,
  manifest: BulkManifest,
  projection: BulkRuntimeProjection,
): BulkVisualRenderManifest => {
  const visual = buildCenteredNestedBulkVisualManifest(
    manifest,
    projection,
  )
  viewport.applyVisualManifestPatch(visual)
  return visual
}
