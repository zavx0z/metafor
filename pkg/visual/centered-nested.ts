/**
 * Side-effect-free production entrypoint for the only ready layout strategy.
 * It intentionally excludes the in-progress `outside-in` implementation and
 * every playground/viewport adapter.
 */
export {
  CenteredNested,
  buildCenteredNestedVisualScene,
  type CenteredNestedVisualScene,
} from "./CenteredNested.ts"
export {buildStateGraph} from "./StateGraph.ts"
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
  visualOwnerDarkParticleIdFromAtomId,
} from "./internal/layout.ts"
export type {
  VisualFieldPlacement,
  VisualFieldProxyPlacement,
  VisualOrbitalPlacement,
  VisualScene,
  VisualStateEdgePlacement,
  VisualTorusPlacement,
} from "./internal/layout.ts"
