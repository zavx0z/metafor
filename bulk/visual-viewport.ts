import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {BulkVisualRenderManifest} from "@metafor/types/bulk/visual"
import {
  classifyVisualInvalidation,
  reconcileVisualScenePayload,
  summarizeVisualScenePatch,
  type VisualLayout,
  type VisualPatchSummary,
  type VisualScenePayload,
} from "@metafor/visual/layout/centered-nested"
import {
  DEFAULT_BULK_VISUAL_LAYOUT,
  adaptBulkVisualRenderManifest,
  buildBulkVisualScenePayload,
} from "./visual-layout.ts"

export type BulkVisualViewportProjectionSink = Readonly<{
  applyVisualManifestPatch(projection: BulkVisualRenderManifest): void
}>

/** What one applied change actually required of the visual scene. */
export type BulkVisualApplyResult = Readonly<{
  payload: VisualScenePayload
  projection: BulkVisualRenderManifest | null
  summary: VisualPatchSummary
}>

/**
 * The canonical manifestation → Visual payload → viewport seam.
 *
 * One `BulkVisualScenePresenter` owns the payload currently on screen. An
 * upstream change is first classified: a change that cannot move geometry skips
 * layout work entirely when the resulting payload is identical, and reaches the
 * viewport only with what actually differs. A structural change rebuilds, since
 * narrowing there would leave the scene stale.
 */
export class BulkVisualScenePresenter {
  #layout: VisualLayout
  #payload: VisualScenePayload | null = null

  constructor(layout: VisualLayout = DEFAULT_BULK_VISUAL_LAYOUT) {
    this.#layout = layout
  }

  get layout(): VisualLayout {
    return this.#layout
  }

  /** The payload currently presented, or `null` before the first apply. */
  get payload(): VisualScenePayload | null {
    return this.#payload
  }

  /**
   * Selects another named strategy. The next apply rebuilds, because a
   * different strategy is free to place every shape differently.
   */
  selectLayout(layout: VisualLayout): void {
    if (layout.slug === this.#layout.slug) return
    this.#layout = layout
    this.#payload = null
  }

  /** Presents a payload prepared elsewhere, such as on a server. */
  hydrate(
    viewport: BulkVisualViewportProjectionSink,
    semanticManifest: BulkManifest,
    payload: VisualScenePayload,
  ): BulkVisualApplyResult {
    if (payload.layoutSlug !== this.#layout.slug) {
      throw new Error(
        `Bulk Visual payload layout ${payload.layoutSlug} does not match the selected ${this.#layout.slug}`,
      )
    }
    const projection = adaptBulkVisualRenderManifest(semanticManifest, payload)
    viewport.applyVisualManifestPatch(projection)
    this.#payload = payload
    return Object.freeze({
      payload,
      projection,
      summary: summarizeVisualScenePatch(
        reconcileVisualScenePayload(null, payload),
      ),
    })
  }

  /**
   * Applies one changed manifestation.
   *
   * `structural` is what the upstream projection reported for the change it
   * applied. When the recomputed payload is identical the viewport is not
   * touched at all and `projection` is `null`.
   */
  apply(
    viewport: BulkVisualViewportProjectionSink,
    semanticManifest: BulkManifest,
    projection: BulkRuntimeProjection,
    change: Readonly<{changed: boolean; structural: boolean}> = {
      changed: true,
      structural: true,
    },
  ): BulkVisualApplyResult {
    const scope = classifyVisualInvalidation(change)
    if (scope === "none" && this.#payload !== null) {
      return Object.freeze({
        payload: this.#payload,
        projection: null,
        summary: summarizeVisualScenePatch({kind: "visual-none-patch"}),
      })
    }
    const payload = buildBulkVisualScenePayload(
      semanticManifest,
      projection,
      this.#layout,
    )
    const patch = reconcileVisualScenePayload(
      scope === "structure" ? null : this.#payload,
      payload,
    )
    const summary = summarizeVisualScenePatch(patch)
    this.#payload = payload
    if (patch.kind === "visual-none-patch") {
      return Object.freeze({payload, projection: null, summary})
    }
    const renderManifest = adaptBulkVisualRenderManifest(
      semanticManifest,
      payload,
    )
    viewport.applyVisualManifestPatch(renderManifest)
    return Object.freeze({payload, projection: renderManifest, summary})
  }
}

/**
 * One-shot manifestation → viewport application. Retained for callers that do
 * not keep presented state, such as isolated labs and tests.
 */
export const applyBulkViewportManifest = (
  viewport: BulkVisualViewportProjectionSink,
  manifest: BulkManifest,
  projection: BulkRuntimeProjection,
  layout: VisualLayout = DEFAULT_BULK_VISUAL_LAYOUT,
): BulkVisualRenderManifest => {
  const payload = buildBulkVisualScenePayload(manifest, projection, layout)
  const renderManifest = adaptBulkVisualRenderManifest(manifest, payload)
  viewport.applyVisualManifestPatch(renderManifest)
  return renderManifest
}
