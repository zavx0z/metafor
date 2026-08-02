import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {
  BulkReadyVisualRenderManifest,
  BulkVisualRenderManifest,
  BulkVisualRenderPatch,
} from "@metafor/types/bulk/visual"
import {
  classifyVisualInvalidation,
  reconcileVisualScenePayload,
  summarizeVisualScenePatch,
  type VisualLayout,
  type VisualPatchSummary,
  type VisualScenePayload,
  type VisualUpstreamChange,
} from "@metafor/visual/layout/centered-nested"
import {
  describeVisualPreparedScene,
  visualDeltaPatchOperations,
  type VisualInvalidationScope,
  type VisualPreparedScene,
} from "@metafor/visual/payload"
import {
  hydrateBulkVisualStore,
  type BulkVisualStore,
  type BulkVisualStoreClosure,
} from "./visual-store.ts"
import {
  DEFAULT_BULK_VISUAL_LAYOUT,
  adaptBulkReadyVisualRenderManifest,
  adaptBulkVisualRenderManifest,
  adaptBulkVisualRenderPatch,
  buildBulkVisualScenePayload,
} from "./visual-layout.ts"

export type BulkVisualViewportProjectionSink = Readonly<{
  applyVisualManifestPatch(projection: BulkVisualRenderManifest): void
  applyVisualReadyScene?(projection: BulkReadyVisualRenderManifest): void
  /**
   * Applies the narrowest correct update.
   *
   * Optional so a sink that only knows how to replace a scene still works —
   * such a sink receives a full projection instead and the presenter reports
   * that it had to widen. A sink that implements it keeps every GPU resource
   * the patch does not name.
   */
  applyVisualRenderPatch?(patch: BulkVisualRenderPatch): void
}>

/**
 * What a caller means when it does not say what changed: everything might have.
 *
 * A caller that knows better passes the real change; one that does not gets the
 * only safe reading, which is a full rebuild rather than a silent narrowing.
 */
const FULL_UPSTREAM_CHANGE: VisualUpstreamChange = Object.freeze({
  affectedAtomIds: Object.freeze([]),
  changed: true,
  facet: "structure",
  structural: true,
})

/** Why one applied change did or did not reach the renderer incrementally. */
export type BulkVisualApplyRoute =
  /** The Store answered from held state; no strategy ran. */
  | "incremental"
  /** Nothing reached the renderer. */
  | "none"
  /** A placement law had to run, so the payload was rebuilt. */
  | "rebuilt"

/** What one applied change actually required of the visual scene. */
export type BulkVisualApplyResult = Readonly<{
  /** What the change reached, when the Store was consulted. */
  closure: BulkVisualStoreClosure | null
  /** Explicit renderer operations, when the update was incremental. */
  patch: BulkVisualRenderPatch | null
  payload: VisualScenePayload
  /** A full projection, when the scene had to be re-specified. */
  projection: BulkVisualRenderManifest | BulkReadyVisualRenderManifest | null
  route: BulkVisualApplyRoute
  scope: VisualInvalidationScope
  summary: VisualPatchSummary
}>

/**
 * The canonical manifestation → Visual payload → viewport seam.
 *
 * One `BulkVisualScenePresenter` owns a persistent {@link BulkVisualStore}: the
 * hydrated scene, its indexes and its renderer records survive from one change
 * to the next. An upstream change is offered to the Store first, and the Store
 * either answers with an exact patch — no strategy runs, no scene is rebuilt,
 * no shape the change did not reach is touched — or reports that the change
 * moves placements, which only the selected strategy can decide. Only then is
 * the payload rebuilt.
 *
 * Bulk does not diff scenes here and does not know what a strategy places. It
 * selects a strategy, holds the Store and forwards what the Store produced.
 */
export class BulkVisualScenePresenter {
  #layout: VisualLayout
  #store: BulkVisualStore | null = null

  constructor(layout: VisualLayout = DEFAULT_BULK_VISUAL_LAYOUT) {
    this.#layout = layout
  }

  get layout(): VisualLayout {
    return this.#layout
  }

  /** The payload currently presented, or `null` before the first apply. */
  get payload(): VisualScenePayload | null {
    return this.#store?.payload ?? null
  }

  /** The persistent Store, or `null` before the first apply. */
  get store(): BulkVisualStore | null {
    return this.#store
  }

  /**
   * Selects another named strategy. The next apply rebuilds, because a
   * different strategy is free to place every shape differently.
   */
  selectLayout(layout: VisualLayout): void {
    if (layout.slug === this.#layout.slug) return
    this.#layout = layout
    this.#store = null
  }

  /**
   * Presents a scene prepared elsewhere, such as on a server, and keeps it.
   *
   * No strategy runs: placements, forms, materials and compact curve controls
   * are read from the prepared scene as they arrived. The renderer adapter
   * alone samples them before building its existing line buffers. What the
   * presenter builds is the persistent Store every later change is served from.
   */
  hydrate(
    viewport: BulkVisualViewportProjectionSink,
    semanticManifest: BulkManifest,
    prepared: VisualPreparedScene | VisualScenePayload,
  ): BulkVisualApplyResult {
    const payload = "payload" in prepared ? prepared.payload : prepared
    if (payload.layoutSlug !== this.#layout.slug) {
      throw new Error(
        `Bulk Visual payload layout ${payload.layoutSlug} does not match the selected ${this.#layout.slug}`,
      )
    }
    this.#store = hydrateBulkVisualStore(
      "payload" in prepared
        ? prepared
        : describeVisualPreparedScene(prepared),
      {placement: this.#layout.placement, slug: this.#layout.slug},
    )
    const projection = adaptBulkVisualRenderManifest(semanticManifest, payload)
    viewport.applyVisualManifestPatch(projection)
    return Object.freeze({
      closure: null,
      patch: null,
      payload,
      projection,
      route: "rebuilt" as const,
      scope: "structure" as const,
      summary: summarizeVisualScenePatch(
        reconcileVisualScenePayload(null, payload),
      ),
    })
  }

  /**
   * Presents the self-sufficient production ready scene.
   *
   * This path owns no Graph, projection or semantic manifestation. It expands
   * renderer records only from the prepared Visual payload, then enters the
   * same viewport and CPU Hermite sampling path as every other full apply.
   */
  hydrateReady(
    viewport: BulkVisualViewportProjectionSink,
    prepared: VisualPreparedScene,
  ): BulkVisualApplyResult {
    const payload = prepared.payload
    if (payload.layoutSlug !== this.#layout.slug) {
      throw new Error(
        `Bulk Visual payload layout ${payload.layoutSlug} does not match the selected ${this.#layout.slug}`,
      )
    }
    this.#store = hydrateBulkVisualStore(
      prepared,
      {placement: this.#layout.placement, slug: this.#layout.slug},
    )
    const projection = adaptBulkReadyVisualRenderManifest(payload)
    if (!viewport.applyVisualReadyScene) {
      throw new Error("Bulk Visual target cannot present a ready scene")
    }
    viewport.applyVisualReadyScene(projection)
    return Object.freeze({
      closure: null,
      patch: null,
      payload,
      projection,
      route: "rebuilt" as const,
      scope: "structure" as const,
      summary: summarizeVisualScenePatch(
        reconcileVisualScenePayload(null, payload),
      ),
    })
  }

  /**
   * Applies one changed manifestation.
   *
   * The change is what the upstream projection reported, facet and affected
   * closure included. It goes to the Store first: a change that cannot move a
   * placement is served from held state, and the renderer receives exactly the
   * entities it reached. A change that moves placements — or one that arrives
   * before anything was hydrated — runs the strategy and re-specifies the
   * scene, because narrowing there would leave geometry stale.
   */
  apply(
    viewport: BulkVisualViewportProjectionSink,
    semanticManifest: BulkManifest,
    projection: BulkRuntimeProjection,
    change: VisualUpstreamChange = FULL_UPSTREAM_CHANGE,
  ): BulkVisualApplyResult {
    const store = this.#store
    if (store !== null) {
      const applied = store.apply(
        change,
        semanticManifest,
      )
      if (applied.kind === "visual-store-applied") {
        const summary = summarizeVisualScenePatch(applied.patch)
        if (
          applied.patch.kind === "visual-none-patch" ||
          visualDeltaPatchOperations(applied.patch).added +
                visualDeltaPatchOperations(applied.patch).removed +
                visualDeltaPatchOperations(applied.patch).updated === 0
        ) {
          return Object.freeze({
            closure: applied.closure,
            patch: null,
            payload: store.payload,
            projection: null,
            route: "none" as const,
            scope: applied.scope,
            summary,
          })
        }
        const patch = adaptBulkVisualRenderPatch(
          semanticManifest,
          store.payload,
          applied.patch,
        )
        if (viewport.applyVisualRenderPatch) {
          viewport.applyVisualRenderPatch(patch)
          return Object.freeze({
            closure: applied.closure,
            patch,
            payload: store.payload,
            projection: null,
            route: "incremental" as const,
            scope: applied.scope,
            summary,
          })
        }
        // The sink cannot apply operations, so it gets the whole projection.
        // The Store still served the change — nothing was rebuilt — but the
        // route is reported honestly as a widening.
        const widened = adaptBulkVisualRenderManifest(
          semanticManifest,
          store.payload,
        )
        viewport.applyVisualManifestPatch(widened)
        return Object.freeze({
          closure: applied.closure,
          patch,
          payload: store.payload,
          projection: widened,
          route: "rebuilt" as const,
          scope: applied.scope,
          summary,
        })
      }
    }

    const scope = classifyVisualInvalidation(change, this.#layout)
    const payload = buildBulkVisualScenePayload(
      semanticManifest,
      projection,
      this.#layout,
    )
    if (store === null) {
      this.#store = hydrateBulkVisualStore(
        describeVisualPreparedScene(payload),
        {placement: this.#layout.placement, slug: this.#layout.slug},
      )
      const renderManifest = adaptBulkVisualRenderManifest(
        semanticManifest,
        payload,
      )
      viewport.applyVisualManifestPatch(renderManifest)
      return Object.freeze({
        closure: null,
        patch: null,
        payload,
        projection: renderManifest,
        route: "rebuilt" as const,
        scope,
        summary: summarizeVisualScenePatch(
          reconcileVisualScenePayload(null, payload),
        ),
      })
    }

    // The strategy re-placed the scene. The Store adopts the result rather than
    // being thrown away: its identities, indexes and renderer records survive,
    // and the delta it computes is what actually differs on the GPU.
    const adopted = store.adopt(payload)
    const summary = summarizeVisualScenePatch(adopted)
    const operations = visualDeltaPatchOperations(adopted)
    if (operations.added + operations.removed + operations.updated === 0) {
      return Object.freeze({
        closure: null,
        patch: null,
        payload,
        projection: null,
        route: "none" as const,
        scope,
        summary,
      })
    }
    const patch = adaptBulkVisualRenderPatch(semanticManifest, payload, adopted)
    if (viewport.applyVisualRenderPatch) {
      viewport.applyVisualRenderPatch(patch)
      return Object.freeze({
        closure: null,
        patch,
        payload,
        projection: null,
        route: "rebuilt" as const,
        scope,
        summary,
      })
    }
    const renderManifest = adaptBulkVisualRenderManifest(
      semanticManifest,
      payload,
    )
    viewport.applyVisualManifestPatch(renderManifest)
    return Object.freeze({
      closure: null,
      patch,
      payload,
      projection: renderManifest,
      route: "rebuilt" as const,
      scope,
      summary,
    })
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
