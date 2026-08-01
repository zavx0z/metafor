/**
 * Side-effect-free production entrypoint for the only ready layout strategy.
 * It intentionally excludes the in-progress `outside-in` implementation and
 * every playground/viewport adapter.
 *
 * The payload and reconciliation contracts are layout-agnostic, so they are
 * re-exported here: a consumer that only ships `centered-nested` still reaches
 * a renderer through the same public surface, without pulling the catalog — and
 * therefore `outside-in` — into its bundle.
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
  type VisualPayloadStats,
  type VisualPayloadTorus,
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
export {
  CenteredNested,
  buildCenteredNestedVisualScene,
  type CenteredNestedVisualScene,
} from "./CenteredNested.ts"
export {buildStateGraph} from "./StateGraph.ts"
export {
  describeVisualPreparedScene,
  isVisualPreparedScene,
  prepareVisualScene,
  type VisualPreparedScene,
} from "./ScenePreparation.ts"
export {
  buildHermiteEdgePath,
  HERMITE_EDGE_SEGMENTS,
} from "./HermiteEdge.ts"
export {
  stateGraphFieldSphereLayout,
  stateGraphNodeFormDimensions,
} from "./StateGraphLayout.ts"
export {SPHERE_MESH_DETAIL} from "./MeshDetail.ts"
export {
  compileVisualComponents,
  type VisualCompiledComponents,
  type VisualComponentForest,
  type VisualRelationEdgeBatch,
  type VisualStateEdgeBatch,
  type VisualTorusComponent,
} from "./VisualComponents.ts"
export {
  buildVisualRelationEdges,
  type VisualRelationEdgePlacement,
} from "./VisualRelations.ts"
export {
  visualRelationColor,
  visualTransitionColor,
} from "./SemanticVisual.ts"
export {
  visualRelationMaterial,
  type VisualLineMaterial,
  type VisualQuantumMaterial,
} from "./VisualMaterialSpec.ts"
export {
  DARK_TORUS_MESH_DETAIL,
  EMBEDDED_TORUS_MESH_DETAIL,
  TORUS_LAYOUT_BASELINE,
} from "./Torus.ts"
export {
  visualLayoutBuiltScenes,
  visualLayoutForSlug,
  visualOwnerDarkParticleIdFromAtomId,
  visualRegisteredLayoutSlugs,
} from "./internal/layout.ts"
export type {
  VisualFieldPlacement,
  VisualFieldProxyPlacement,
  VisualLayout,
  VisualLayoutInput,
  VisualLayoutSlug,
  VisualOrbitalPlacement,
  VisualOwnerGraph,
  VisualPlacementSensitivity,
  VisualScene,
  VisualStateEdgePlacement,
  VisualTorusPlacement,
} from "./internal/layout.ts"
