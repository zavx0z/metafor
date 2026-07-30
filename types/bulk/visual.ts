import type {BulkRenderManifest} from "./manifest.ts"

/** Canonical Field occurrence represented by one synthetic render marker. */
export type BulkVisualFieldAlias = Readonly<{
  sourceFieldId: number
  sourceFieldParticleId: string
  sourceParentDarkParticleId: number
  visualFieldParticleId: string
}>

/** Exact Torus form for one canonical State occurrence. */
export type BulkVisualOrbitalTorus = Readonly<{
  orbitalParticleId: string
  radius: number
  tube: number
}>

/** Exact Sphere form for one visible causal occurrence. */
export type BulkVisualOrbitalSphere = Readonly<{
  orbitalParticleId: string
  radius: number
}>

/** Exact spherical form for one canonical condition Field proxy. */
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

export type BulkVisualPathPoint = Readonly<{
  x: number
  y: number
  z: number
}>

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

export type BulkVisualTransitionPath = Readonly<{
  batchId: string
  batchFingerprint: string
  material: BulkVisualLineMaterial
  ownerDarkParticleId: number
  path: readonly BulkVisualPathPoint[]
  returning: boolean
  transitionChannelId: string
}>

export type BulkVisualRelationPath = Readonly<{
  batchId: string
  batchFingerprint: string
  material: BulkVisualLineMaterial
  ownerDarkParticleId: number
  path: readonly BulkVisualPathPoint[]
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

/**
 * Bulk-owned render projection. `manifest` is an identity-aware render shape
 * and must not be persisted as canonical manifestation.
 */
export type BulkVisualRenderManifest = Readonly<{
  darkTorusMeshDetail: BulkVisualTorusMeshDetail
  darkMaterials: readonly BulkVisualDarkMaterial[]
  embeddedTorusMeshDetail: BulkVisualTorusMeshDetail
  fieldAliases: readonly BulkVisualFieldAlias[]
  fieldMaterials: readonly BulkVisualFieldMaterial[]
  fieldProxyMaterials: readonly BulkVisualFieldProxyMaterial[]
  fieldProxySpheres: readonly BulkVisualFieldProxySphere[]
  fieldProxyTori: readonly BulkVisualFieldProxyTorus[]
  layoutSlug: "centered-nested"
  manifest: BulkRenderManifest
  orbitalMaterials: readonly BulkVisualOrbitalMaterial[]
  orbitalSpheres: readonly BulkVisualOrbitalSphere[]
  orbitalTori: readonly BulkVisualOrbitalTorus[]
  relationPaths: readonly BulkVisualRelationPath[]
  sourceStats: BulkVisualSourceStats
  sphereMeshDetail: BulkVisualSphereMeshDetail
  transitionPaths: readonly BulkVisualTransitionPath[]
}>
