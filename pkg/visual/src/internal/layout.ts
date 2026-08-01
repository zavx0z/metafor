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
  /**
   * Orbital whose own activity — not the anchor State's — drives this proxy's
   * paint, or `null` when the State alone does.
   *
   * A proxy's colour is fixed by the source Field's kind, but its opacity and
   * glow follow whatever is running. Three laws produce proxies and two of them
   * are spheres, so the form cannot tell them apart. Naming the driving Orbital
   * here lets a Store repaint a proxy from semantics alone, without asking a
   * strategy to place it again.
   */
  paintOrbitalParticleId: string | null
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

/**
 * Which non-structural upstream facts this strategy's placement law reads.
 *
 * A strategy declares this because the answer is genuinely strategy-specific
 * and cannot be inferred from the change alone. `centered-nested` groups Fields
 * by canonical Value and lifts a shared group to the highest common owner, so
 * rebinding a Value physically relocates markers; `outside-in` places every
 * Field in its own owner's core and only carries `valueId` as data, so the same
 * rebinding moves nothing. Reading a change as appearance-only without asking
 * the strategy is how a Field Value edit silently leaves stale geometry.
 */
export type VisualPlacementSensitivity = Readonly<{
  /** Whether the current-State marker participates in placement. */
  currentState: boolean
  /** Whether a Field Value or binding participates in placement. */
  fieldValue: boolean
}>

export type VisualLayout = Readonly<{
  buildScene(input: VisualLayoutInput): VisualScene
  description: string
  label: string
  placement: VisualPlacementSensitivity
  slug: VisualLayoutSlug
  status: VisualLayoutStatus
}>

let builtScenes = 0

/**
 * How many times any named strategy has actually run its placement law.
 *
 * Every strategy reaches a consumer through `defineVisualLayout`, so this is the
 * one honest answer to "did this path lay the scene out itself?". A consumer
 * that only hydrates prepared geometry must leave the counter untouched, and a
 * test can assert exactly that instead of trusting a comment.
 */
export const visualLayoutBuiltScenes = (): number => builtScenes

const registry = new Map<string, VisualLayout>()

/**
 * Resolves one declarative strategy reference against what this bundle ships.
 *
 * A strategy registers itself by being defined, so the answer depends on the
 * module graph a consumer actually imported, not on a catalog module that would
 * pull every strategy in behind it. That is what lets a production consumer
 * select a strategy by slug while still shipping only the ready one.
 */
export const visualLayoutForSlug = (
  slug: string,
): VisualLayout | undefined => registry.get(slug)

/** Slugs this bundle can resolve, for a diagnostic that names the alternatives. */
export const visualRegisteredLayoutSlugs = (): readonly string[] =>
  [...registry.keys()].sort()

export const defineVisualLayout = (
  layout: VisualLayout,
): VisualLayout => {
  const defined: VisualLayout = Object.freeze({
    ...layout,
    placement: Object.freeze({...layout.placement}),
    buildScene: (input: VisualLayoutInput): VisualScene => {
      builtScenes++
      return layout.buildScene(input)
    },
  })
  registry.set(defined.slug, defined)
  return defined
}

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
