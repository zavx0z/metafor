/**
 * Side-effect-free production entrypoint for the `centered-nested` strategy.
 * It intentionally excludes the separate ready `outside-in` implementation and
 * every playground/viewport adapter.
 *
 * The payload and reconciliation contracts are layout-agnostic, so they are
 * re-exported here: a consumer that only ships `centered-nested` still reaches
 * a renderer through the same public surface, without pulling the catalog — and
 * therefore `outside-in` — into its bundle.
 */
export {
  buildVisualScenePayload,
  isVisualScenePayload,
  projectVisualScenePayload,
  visualPayloadHermiteCurve,
  visualPayloadFieldParticleId,
  VISUAL_PAYLOAD_CURVE_LAW,
  type VisualPayloadCurveLaw,
  type VisualPayloadEdgeBatch,
  type VisualPayloadEdgePath,
  type VisualPayloadField,
  type VisualPayloadFieldAlias,
  type VisualPayloadFieldProxy,
  type VisualPayloadHermiteCurve,
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
  layoutCenteredNestedFieldSubtree,
  layoutCenteredNestedFields,
  type CenteredNestedFieldPlacement,
  type CenteredNestedVisualScene,
} from "./CenteredNested.ts"
export {
  buildStateGraph,
  buildStateGraphFromFacts,
  type StateGraphFacts,
} from "./StateGraph.ts"
export {
  describeVisualPreparedScene,
  isVisualPreparedScene,
  prepareVisualScene,
  type VisualPreparedScene,
} from "./ScenePreparation.ts"
export {
  buildHermiteEdgePath,
  describeHermiteEdgeCurve,
  HERMITE_EDGE_SEGMENTS,
  sampleHermiteEdgeCurve,
  writeHermiteEdgeSegments,
  type HermiteEdgeCurve,
} from "./HermiteEdge.ts"
export {
  buildStateGraphBranchLayoutFromIndex,
  describeStateGraphHermiteEdgeCurve,
  indexStateGraphLayout,
  stateGraphFieldSphereLayout,
  stateGraphNodeFormDimensions,
  STATE_GRAPH_PRODUCTION_SIZING,
  type StateGraphLayoutSizing,
  type StateGraphRootLayout,
} from "./StateGraphLayout.ts"
export {layoutFieldsInPseudoCircle} from "./FieldsLayout.ts"
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
  visualDarkParticleColor,
  visualFieldParticleColor,
  visualOrbitalParticleColor,
  visualRelationColor,
  visualTransitionColor,
} from "./SemanticVisual.ts"
export {
  visualCausalMaterial,
  visualConditionFieldMaterial,
  visualContextTorusMaterial,
  visualCoreFieldMaterial,
  visualFieldProxyMaterial,
  visualProcessTorusMaterial,
  visualRelationMaterial,
  visualStateTorusMaterial,
  visualTransitionMaterial,
  type VisualLineMaterial,
  type VisualQuantumMaterial,
} from "./VisualMaterialSpec.ts"
export {
  DARK_TORUS_MESH_DETAIL,
  EMBEDDED_TORUS_MESH_DETAIL,
  TORUS_LAYOUT_BASELINE,
  resolveContentTorusForm,
  torusFieldRadiusAtLevel,
  torusLevelScale,
} from "./Torus.ts"
export {
  visualLayoutBuiltScenes,
  visualLayoutForSlug,
  visualOwnerDarkParticleIdFromAtomId,
  visualRegisteredLayoutSlugs,
} from "./internal/layout.ts"
export {
  packStateSleeves,
  placeStateLayout,
  prepareStateLayout,
  stateInnerOrbitRadius,
  stateNodeSurfaceGap,
  stateSleevePhase,
  type PreparedStateLayout,
  type StatePlacement,
  type StateSleevePackingEnvelope,
} from "./internal/state-sleeves.ts"
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
