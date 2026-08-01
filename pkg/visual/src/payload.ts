/**
 * Engine-neutral production entrypoint for the serializable rendering payload.
 *
 * A server prepares a payload here and a browser applies it; nothing in this
 * module touches Canvas, GPU resources, `Renderer`, `Space` or `ViewPoint`.
 * Both named layout strategies reach a renderer through this one contract.
 */
export {
  buildVisualScenePayload,
  projectVisualScenePayload,
  visualPayloadFieldParticleId,
  type VisualPayloadEdgeBatch,
  type VisualPayloadEdgePath,
  type VisualPayloadField,
  type VisualPayloadFieldAlias,
  type VisualPayloadFieldProxy,
  type VisualPayloadOrbital,
  type VisualPayloadPoint,
  type VisualPayloadSphereMeshDetail,
  type VisualPayloadStats,
  type VisualPayloadTorus,
  type VisualPayloadTorusMeshDetail,
  type VisualPayloadTransitionBatch,
  type VisualScenePayload,
} from "./ScenePayload.ts"
export {
  classifyVisualInvalidation,
  diffVisualScenePayload,
  reconcileVisualScenePayload,
  sameVisualPayloadIdentities,
  summarizeVisualScenePatch,
  visualDeltaPatchOperations,
  visualScopeKeepsPlacements,
  widenVisualInvalidation,
  type VisualAppearancePatch,
  type VisualDeltaPatch,
  type VisualEntityDelta,
  type VisualInvalidationScope,
  type VisualPatchSummary,
  type VisualScenePatch,
  type VisualUpstreamChange,
  type VisualUpstreamFacet,
} from "./SceneReconciler.ts"
export {Visual, visualLayoutForSlug} from "./Visual.ts"
export {CenteredNested} from "./CenteredNested.ts"
export {OutsideIn} from "./OutsideIn.ts"
export {
  describeVisualPreparedScene,
  isVisualPreparedScene,
  prepareVisualScene,
  type VisualPreparedScene,
} from "./ScenePreparation.ts"
export {
  visualLayoutBuiltScenes,
  visualOwnerDarkParticleIdFromAtomId,
} from "./internal/layout.ts"
export type {
  VisualLayout,
  VisualLayoutInput,
  VisualLayoutSlug,
  VisualLayoutStatus,
  VisualOwnerGraph,
  VisualPlacementSensitivity,
} from "./internal/layout.ts"
export {buildStateGraph, type StateGraph} from "./StateGraph.ts"
