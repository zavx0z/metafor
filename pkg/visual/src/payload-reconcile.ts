/**
 * Stateless payload reconciliation primitives used by a state-owning caller.
 *
 * This entrypoint deliberately excludes executable layout strategies. It
 * classifies and diffs declarative artifacts but stores no payload or policy.
 */
export {
  visualPayloadHermiteCurve,
  writeVisualPayloadHermiteSegments,
  type VisualPayloadEdgeBatch,
  type VisualPayloadEdgePath,
  type VisualPayloadField,
  type VisualPayloadFieldAlias,
  type VisualPayloadFieldProxy,
  type VisualPayloadHermiteCurve,
  type VisualPayloadOrbital,
  type VisualPayloadTorus,
  type VisualPayloadTransitionBatch,
  type VisualScenePayload,
} from "./ScenePayload.ts"
export {
  sampleHermiteEdgeCurve,
  writeHermiteEdgeSegments,
} from "./HermiteEdge.ts"
export {
  classifyVisualInvalidation,
  diffVisualScenePayload,
  visualScopeKeepsPlacements,
  type VisualDeltaPatch,
  type VisualEntityDelta,
  type VisualInvalidationScope,
  type VisualUpstreamChange,
} from "./SceneReconciler.ts"
export {
  describeVisualPreparedScene,
  isVisualPreparedScene,
  type VisualPreparedScene,
} from "./ScenePreparation.ts"
export {visualBatchFingerprint} from "./internal/fingerprint.ts"
export {
  visualRelationEdgeBatchId,
  visualStateEdgeBatchId,
} from "./VisualComponents.ts"
export {visualOwnerDarkParticleIdFromAtomId} from "./internal/layout.ts"
export type {
  VisualLayoutSlug,
  VisualPlacementSensitivity,
} from "./internal/layout.ts"
