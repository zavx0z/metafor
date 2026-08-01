import type {BulkInitialPackage} from "@metafor/types/bulk/initial"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkVisualLayoutSlug} from "@metafor/types/bulk/visual"
import {
  describeVisualPreparedScene,
  type VisualCausalFrontier,
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
 * `BulkInitialPackage` stays in `@metafor/types` because it is a transport cut
 * of the projection, and that package must not depend on `@metafor/visual`. The
 * prepared visual state is composed here instead, on the Bulk seam that already
 * owns both dependencies. A browser reading this needs no layout strategy to
 * put a complete scene on screen.
 */
export type BulkInitialScene = BulkInitialPackage & {
  visual: VisualPreparedScene
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
  input: Readonly<{
    configuration?: BulkVisualConfiguration
    frontier: VisualCausalFrontier | null
    sourceRevision: string
  }>,
): VisualPreparedScene => {
  const configuration = input.configuration ?? DEFAULT_BULK_VISUAL_CONFIGURATION
  const layout = resolveBulkVisualLayout(configuration.layoutSlug)
  return describeVisualPreparedScene(
    buildBulkVisualScenePayload(manifest, projection, layout),
    {frontier: input.frontier, sourceRevision: input.sourceRevision},
  )
}
