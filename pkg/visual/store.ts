/**
 * Layout-agnostic production entrypoint for the persistent browser visual state.
 *
 * A browser hydrates a server-prepared scene into a `VisualStore` here and then
 * feeds upstream changes into it; the Store answers with an exact renderer patch
 * or with an explicit request to re-run the owning layout. Nothing in this module
 * touches Canvas, GPU resources, `Renderer`, `Space` or `ViewPoint`, and nothing
 * here reaches the layout catalog — a consumer that ships only `centered-nested`
 * keeps that bundle free of `outside-in`.
 *
 * It is deliberately separate from `./centered-nested.ts`: that entrypoint carries
 * the geometry of one named strategy and is held to a size budget, while the Store
 * is strategy-neutral runtime state that both strategies share.
 */
export {
  hydrateVisualStore,
  VisualStore,
  type VisualStoreApplication,
  type VisualStoreClosure,
  type VisualStoreEntityClass,
  type VisualStoreLayoutReference,
  type VisualStoreRendererRecord,
} from "./VisualStore.ts"
export {
  classifyVisualInvalidation,
  diffVisualScenePayload,
  summarizeVisualScenePatch,
  visualDeltaPatchOperations,
  visualScopeKeepsPlacements,
  widenVisualInvalidation,
  type VisualDeltaPatch,
  type VisualEntityDelta,
  type VisualInvalidationScope,
  type VisualPatchSummary,
  type VisualUpstreamChange,
  type VisualUpstreamFacet,
} from "./SceneReconciler.ts"
export {
  describeVisualPreparedScene,
  isLaterVisualFrontier,
  isVisualPreparedScene,
  type VisualCausalFrontier,
  type VisualPreparedScene,
} from "./ScenePreparation.ts"
export type {
  VisualLayoutSlug,
  VisualPlacementSensitivity,
} from "./internal/layout.ts"
