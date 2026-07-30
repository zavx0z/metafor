import type {
  BulkDarkParticleKind,
  BulkFieldParticleKind,
  BulkManifest,
} from "@metafor/types/bulk/manifest"
import type {StateGraph} from "../StateGraph.ts"
import type {StateGraphRootLayout} from "../StateGraphLayout.ts"
import type {
  VisualLineMaterial,
  VisualQuantumMaterial,
} from "../VisualMaterialSpec.ts"
import {
  compileVisualComponents,
  type VisualComponentForest,
  type VisualRelationEdgeBatch,
  type VisualStateEdgeBatch,
} from "../VisualComponents.ts"
import type {
  VisualRelationEdgePlacement,
} from "../VisualRelations.ts"

export type VisualLayoutSlug = "centered-nested" | "outside-in"

export type VisualLayoutStatus = "in-progress" | "ready"

export type VisualOwnerGraph = Readonly<{
  graph: StateGraph
  ownerDarkParticleId: number
}>

export type VisualTorusPlacement = Readonly<{
  color: readonly [number, number, number]
  darkParticleId: number
  darkParticleKind: BulkDarkParticleKind
  depth: number
  material: VisualQuantumMaterial
  parentDarkParticleId: number | null
  radius: number
  src: string | null
  tube: number
  x: number
  y: number
  z: number
}>

export type VisualFieldPlacement = Readonly<{
  color: readonly [number, number, number]
  fieldIds: readonly number[]
  fieldKeys: readonly string[]
  fieldParticleIds: readonly string[]
  fieldParticleKind: BulkFieldParticleKind
  material: VisualQuantumMaterial
  ownerDarkParticleId: number
  sourceOwnerDarkParticleIds: readonly number[]
  valueId: number | null
  valueText: string | null
  radius: number
  x: number
  y: number
  z: number
}>

export type VisualStateOccurrenceIdentity = Readonly<{
  nodeId: string
  orbitalParticleId: string
}>

export type VisualEdgePathPoint = Readonly<{
  x: number
  y: number
  z: number
}>

export type VisualStateEdgePlacement = Readonly<{
  edgeId: string
  fromNodeId: string
  material: VisualLineMaterial
  path: readonly VisualEdgePathPoint[]
  returning: boolean
  toNodeId: string
  transitionChannelId: string | null
  transitionId: number
}>

export type VisualStateSleevePlacement = Readonly<{
  edges: readonly VisualStateEdgePlacement[]
  layout: StateGraphRootLayout
  occurrences: readonly VisualStateOccurrenceIdentity[]
  ownerAtomId: number
  ownerDarkParticleId: number
  ownerSrc: string
  rootStateId: number
}>

export type VisualParticleForm =
  | Readonly<{kind: "sphere"; radius: number}>
  | Readonly<{kind: "torus"; radius: number; tube: number}>

export type VisualOrbitalPlacement = Readonly<{
  anchorStateOrbitalParticleId: string | null
  color: readonly [number, number, number]
  form: VisualParticleForm
  material: VisualQuantumMaterial
  orbitalParticleId: string
  ownerDarkParticleId: number
  x: number
  y: number
  z: number
}>

export type VisualFieldProxyPlacement = Readonly<{
  color: readonly [number, number, number]
  fieldProxyId: string
  form: VisualParticleForm
  material: VisualQuantumMaterial
  ownerDarkParticleId: number
  stateOrbitalParticleId: string
  x: number
  y: number
  z: number
}>

export type VisualScene = Readonly<{
  components: VisualComponentForest
  fields: readonly VisualFieldPlacement[]
  fieldProxies: readonly VisualFieldProxyPlacement[]
  layoutSlug: VisualLayoutSlug
  orbitals: readonly VisualOrbitalPlacement[]
  relationEdgeBatches: readonly VisualRelationEdgeBatch[]
  relationEdges: readonly VisualRelationEdgePlacement[]
  stateEdgeBatches: readonly VisualStateEdgeBatch[]
  stateSleeves: readonly VisualStateSleevePlacement[]
  tori: readonly VisualTorusPlacement[]
}>

export type VisualLayoutInput = Readonly<{
  manifest: BulkManifest
  owners: readonly VisualOwnerGraph[]
}>

/** Resolves the current canonical Bulk Atom occurrence namespace. */
export const visualOwnerDarkParticleIdFromAtomId = (
  atomId: number,
): number => {
  const ownerDarkParticleId = atomId * 2
  if (!Number.isSafeInteger(ownerDarkParticleId)) {
    throw new RangeError(
      `Visual Atom ${atomId} has no safe Dark particle identity`,
    )
  }
  return ownerDarkParticleId
}

export type VisualLayout = Readonly<{
  buildScene(input: VisualLayoutInput): VisualScene
  description: string
  label: string
  slug: VisualLayoutSlug
  status: VisualLayoutStatus
}>

export const defineVisualLayout = (
  layout: VisualLayout,
): VisualLayout => Object.freeze({...layout})

const freezeTuple = (
  color: readonly [number, number, number],
): readonly [number, number, number] =>
  Object.freeze([...color]) as readonly [number, number, number]

export const freezeStateGraphLayout = (
  layout: StateGraphRootLayout,
): StateGraphRootLayout => Object.freeze({
  rootStateId: layout.rootStateId,
  edges: Object.freeze(layout.edges.map((edge) => Object.freeze({
    ...edge,
    conditionFieldIds: Object.freeze([...edge.conditionFieldIds]),
  }))),
  levels: Object.freeze(layout.levels.map((level) => Object.freeze({
    ...level,
    nodeIds: Object.freeze([...level.nodeIds]),
  }))),
  nodes: Object.freeze(layout.nodes.map((node) => Object.freeze({
    ...node,
    color: freezeTuple(node.color),
    fields: Object.freeze(node.fields.map((field) =>
      Object.freeze({...field})
    )),
  }))),
})

export const defineVisualScene = (
  scene: Readonly<{
    components: VisualComponentForest
    layoutSlug: VisualLayoutSlug
  }>,
): VisualScene => {
  const compiled = compileVisualComponents(scene.components)
  return Object.freeze({
    components: scene.components,
    fields: compiled.fields,
    fieldProxies: compiled.fieldProxies,
    layoutSlug: scene.layoutSlug,
    orbitals: compiled.orbitals,
    relationEdgeBatches: compiled.relationEdgeBatches,
    relationEdges: compiled.relationEdges,
    stateEdgeBatches: compiled.stateEdgeBatches,
    stateSleeves: compiled.stateSleeves,
    tori: compiled.tori,
  })
}
