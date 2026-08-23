import type {
  BulkRenderDarkParticle,
  BulkRenderFieldParticle,
  BulkRenderFieldProxy,
  BulkRenderManifest,
  BulkRenderOrbitalParticle,
} from "./manifest.ts"

/**
 * Named layout strategy that produced a render projection.
 *
 * `pkg/visual` owns the catalog; this mirrors its slugs so the renderer can
 * carry the selection without `types` depending on the visual package.
 */
export type BulkVisualLayoutSlug = "centered-nested" | "outside-in"

/** Canonical Field occurrence represented by one synthetic render marker. */
export type BulkVisualFieldAlias = Readonly<{
  sourceFieldId: number
  sourceFieldParticleId: string
  sourceParentDarkParticleId: number
  visualFieldParticleId: string
}>

/** Exact Torus form for one canonical State, Process or Finally occurrence. */
export type BulkVisualOrbitalTorus = Readonly<{
  orbitalParticleId: string
  radius: number
  tube: number
}>

/** Exact Sphere form for one visible non-toroidal causal occurrence. */
export type BulkVisualOrbitalSphere = Readonly<{
  orbitalParticleId: string
  radius: number
}>

/** Exact spherical form for one canonical condition or Process Field proxy. */
export type BulkVisualFieldProxySphere = Readonly<{
  fieldProxyId: string
  radius: number
}>

/** Exact toroidal form for one non-condition Field proxy. */
export type BulkVisualFieldProxyTorus = Readonly<{
  fieldProxyId: string
  radius: number
  tube: number
}>

export type BulkVisualTorusMeshDetail = Readonly<{
  radialSegments: number
  tubularSegments: number
}>

export type BulkVisualSphereMeshDetail = Readonly<{
  widthSegments: number
  heightSegments: number
}>

export type BulkVisualRgb = readonly [number, number, number]
export type BulkVisualRgba = readonly [number, number, number, number]

export type BulkVisualQuantumMaterial = Readonly<{
  color: BulkVisualRgb
  form: "sphere" | "torus"
  glowIntensity: number
  highlightSize: number
  kind: "quantum"
  opacity: number
}>

export type BulkVisualLineMaterial = Readonly<{
  color: BulkVisualRgba
  glowColor: BulkVisualRgba
  glowIntensity: number
  kind: "line-glow"
  opacity: number
  visibilityMode: "scene" | "overlay"
}>

/** Versioned compact curve law mirrored from the engine-neutral Visual payload. */
export type BulkVisualCurveLaw = Readonly<{
  kind: "cubic-hermite"
  segmentsPerCurve: 64
  version: 1
}>

/** Owner-local source/target points followed by their two derivatives. */
export type BulkVisualHermiteCurve = readonly [
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number,
  fromTangentX: number,
  fromTangentY: number,
  fromTangentZ: number,
  toTangentX: number,
  toTangentY: number,
  toTangentZ: number,
]
export type BulkVisualDarkMaterial = Readonly<{
  darkParticleId: number
  material: BulkVisualQuantumMaterial
}>

export type BulkVisualFieldMaterial = Readonly<{
  fieldParticleId: string
  material: BulkVisualQuantumMaterial
}>

export type BulkVisualOrbitalMaterial = Readonly<{
  orbitalParticleId: string
  material: BulkVisualQuantumMaterial
}>

export type BulkVisualFieldProxyMaterial = Readonly<{
  fieldProxyId: string
  material: BulkVisualQuantumMaterial
}>

/**
 * One compact channel path in its owner's local frame. The browser CPU
 * reconstructs the fixed 64-segment arcs before entering the existing renderer.
 */
export type BulkVisualTransitionPath = Readonly<{
  batchId: string
  batchFingerprint: string
  material: BulkVisualLineMaterial
  ownerDarkParticleId: number
  curves: readonly BulkVisualHermiteCurve[]
  returning: boolean
  transitionChannelId: string
}>

export type BulkVisualRelationPath = Readonly<{
  batchId: string
  batchFingerprint: string
  material: BulkVisualLineMaterial
  ownerDarkParticleId: number
  curves: readonly BulkVisualHermiteCurve[]
  relationChannelId: string
}>

/**
 * Canonical counts copied by the adapter without crossing the full semantic
 * manifestation into the renderer.
 */
export type BulkVisualSourceStats = Readonly<{
  darkParticleCount: number
  fieldParticleCount: number
  orbitalParticleCount: number
  rootSrc: string
  transitionChannelCount: number
}>

/** Minimal Dark facts the browser renderer actually owns. */
export type BulkReadyRenderDarkParticle = Readonly<{
  darkParticleId: number
  parentDarkParticleId: number | null
  darkParticleKind: "atom" | "fuzzy" | "macho" | "axion"
  label: string
  depth: number
  darkParticleOrder: number
  localX: number
  localY: number
  localZ: number
  torusRadius: number
  torusTube: number
  colorR: number
  colorG: number
  colorB: number
}>

export type BulkReadyRenderFieldParticle = Readonly<{
  fieldParticleId: string
  fieldId: number
  parentDarkParticleId: number
  fieldKey: string
  fieldLabel: string
  fieldParticleKind: "string" | "number" | "boolean" | "enum" | "array" | "other"
  localX: number
  localY: number
  localZ: number
  sphereRadius: number
  colorR: number
  colorG: number
  colorB: number
}>

export type BulkReadyRenderOrbitalParticle = Readonly<{
  orbitalParticleId: string
  sourceId: number
  parentDarkParticleId: number
  orbitalParticleKind: "state" | "process" | "reaction" | "finally" | "axion"
  label: string
  localX: number
  localY: number
  localZ: number
  colorR: number
  colorG: number
  colorB: number
}>

export type BulkReadyRenderFieldProxy = Readonly<{
  fieldProxyId: string
  fieldParticleId: string
  fieldId: number
  parentDarkParticleId: number
  stateOrbitalParticleId: string
  localX: number
  localY: number
  localZ: number
  colorR: number
  colorG: number
  colorB: number
}>

export type BulkReadyRenderTransitionChannel = Readonly<{
  transitionChannelId: string
  parentDarkParticleId: number
  colorR: number
  colorG: number
  colorB: number
}>

export type BulkReadyRenderRelationChannel = Readonly<{
  relationChannelId: string
  parentDarkParticleId: number
  colorR: number
  colorG: number
  colorB: number
}>

/** Geometry-bearing browser entity cut with no semantic manifestation. */
export type BulkReadyRenderScene = Readonly<{
  rootSrc: string
  darkParticles: readonly BulkReadyRenderDarkParticle[]
  fieldParticles: readonly BulkReadyRenderFieldParticle[]
  orbitalParticles: readonly BulkReadyRenderOrbitalParticle[]
  transitionChannels: readonly BulkReadyRenderTransitionChannel[]
  fieldProxies: readonly BulkReadyRenderFieldProxy[]
  relationChannels: readonly BulkReadyRenderRelationChannel[]
}>

/** Browser-only expansion of one self-sufficient prepared Visual payload. */
export type BulkReadyVisualRenderManifest = Readonly<
  Omit<BulkVisualRenderManifest, "manifest"> & {
    manifest: BulkReadyRenderScene
  }
>

/**
 * Bulk-owned render projection. `manifest` is an identity-aware render shape
 * and must not be persisted as canonical manifestation.
 */
export type BulkVisualRenderManifest = Readonly<{
  curveLaw: BulkVisualCurveLaw
  darkTorusMeshDetail: BulkVisualTorusMeshDetail
  darkMaterials: readonly BulkVisualDarkMaterial[]
  embeddedTorusMeshDetail: BulkVisualTorusMeshDetail
  fieldAliases: readonly BulkVisualFieldAlias[]
  fieldMaterials: readonly BulkVisualFieldMaterial[]
  fieldProxyMaterials: readonly BulkVisualFieldProxyMaterial[]
  fieldProxySpheres: readonly BulkVisualFieldProxySphere[]
  fieldProxyTori: readonly BulkVisualFieldProxyTorus[]
  layoutSlug: BulkVisualLayoutSlug
  manifest: BulkRenderManifest
  orbitalMaterials: readonly BulkVisualOrbitalMaterial[]
  orbitalSpheres: readonly BulkVisualOrbitalSphere[]
  orbitalTori: readonly BulkVisualOrbitalTorus[]
  relationPaths: readonly BulkVisualRelationPath[]
  sourceStats: BulkVisualSourceStats
  sphereMeshDetail: BulkVisualSphereMeshDetail
  transitionPaths: readonly BulkVisualTransitionPath[]
}>

/**
 * What one visual change actually asks the renderer to touch.
 *
 * A render patch names entities by their visual identity and says nothing about
 * the ones it omits, which is the whole point: an entity absent from the patch
 * keeps the Mesh, geometry buffer, material and line buffer it already holds on
 * the GPU. `removed` carries identities rather than values, because releasing a
 * resource needs the name and nothing else.
 *
 * The mesh-detail laws are carried because a renderer builds geometry from them
 * and a patch has to be self-sufficient; they are the same values the last full
 * manifest declared unless the specification itself changed, in which case the
 * scene is replaced rather than patched.
 */
export type BulkVisualRenderPatch = Readonly<{
  curveLaw: BulkVisualCurveLaw
  darkMaterials: readonly BulkVisualDarkMaterial[]
  darkParticles: readonly BulkRenderDarkParticle[]
  darkTorusMeshDetail: BulkVisualTorusMeshDetail
  embeddedTorusMeshDetail: BulkVisualTorusMeshDetail
  fieldAliases: readonly BulkVisualFieldAlias[]
  fieldMaterials: readonly BulkVisualFieldMaterial[]
  fieldParticles: readonly BulkRenderFieldParticle[]
  fieldProxies: readonly BulkRenderFieldProxy[]
  fieldProxyMaterials: readonly BulkVisualFieldProxyMaterial[]
  fieldProxySpheres: readonly BulkVisualFieldProxySphere[]
  fieldProxyTori: readonly BulkVisualFieldProxyTorus[]
  kind: "bulk-visual-render-patch"
  layoutSlug: BulkVisualLayoutSlug
  orbitalMaterials: readonly BulkVisualOrbitalMaterial[]
  orbitalParticles: readonly BulkRenderOrbitalParticle[]
  orbitalSpheres: readonly BulkVisualOrbitalSphere[]
  orbitalTori: readonly BulkVisualOrbitalTorus[]
  relationPaths: readonly BulkVisualRelationPath[]
  removedDarkParticleIds: readonly number[]
  removedFieldParticleIds: readonly string[]
  removedFieldProxyIds: readonly string[]
  removedOrbitalParticleIds: readonly string[]
  removedRelationBatchIds: readonly string[]
  removedTransitionBatchIds: readonly string[]
  /**
   * Canonical source counts after the change. A patch names only what moved,
   * but the counts it does not move are still reported, so a consumer that
   * shows them stays truthful without re-reading the manifestation.
   */
  sourceStats: BulkVisualSourceStats
  sphereMeshDetail: BulkVisualSphereMeshDetail
  transitionPaths: readonly BulkVisualTransitionPath[]
}>

/** Either a full projection or the narrowest correct patch over one. */
export type BulkVisualRenderUpdate =
  | BulkVisualRenderManifest
  | BulkVisualRenderPatch
