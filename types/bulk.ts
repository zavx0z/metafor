import type {MatterParticleKind} from "./matter.ts"
import type {ActorRecord, ActorValueRecord, FieldEnumVariantRecord, TopologyRecord, ValueItemRecord} from "./persistence.ts"

export interface BulkRuntimeMatterParticle {
  id: number
  wimp: string
  parentParticle: number | null
  particleKind: MatterParticleKind
  edgeSlot: "root" | "child" | "then" | "else" | "branch"
  particleOrder: number
}

export interface BulkRuntimeWimp {
  src: string
  name: string | null
}

export interface BulkRuntimeField {
  id: number
  wimp: string
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
  label: string | null
}

export interface BulkRuntimeValue {
  id: number
  kind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  booleanValue: number | null
  numberValue: number | null
  textValue: string | null
  enumValue: string | null
}

export interface BulkRuntimeMatterBindingPath {
  wimp: string
  particle: number
  depOrder: number
  path: string
}

export interface BulkRuntimeMatterChildBindingPath extends BulkRuntimeMatterBindingPath {
  childOrder: number
}

export interface BulkRuntimeSnapshot {
  version: 1
  actors: ActorRecord[]
  topologies: TopologyRecord[]
  wimps: BulkRuntimeWimp[]
  fields: BulkRuntimeField[]
  fieldEnumVariants: FieldEnumVariantRecord[]
  actorValues: ActorValueRecord[]
  values: BulkRuntimeValue[]
  valueItems: ValueItemRecord[]
  matterParticles: BulkRuntimeMatterParticle[]
  matterTopologyBindingPaths: BulkRuntimeMatterBindingPath[]
  matterChildWimpBindingPaths: BulkRuntimeMatterChildBindingPath[]
}

export type BulkDarkParticleKind = "wimp" | "fuzzy" | "macho" | "axion"

export type BulkOrdinaryFieldKind = "string" | "number" | "boolean"

export type BulkLegacyFieldKind = "enum" | "array" | "other"

// TODO: enum/array are connectivity particles and should be manifested as Fuzzy/MACHO, not ordinary field particles.
export type BulkFieldParticleKind = BulkOrdinaryFieldKind | BulkLegacyFieldKind

export type BulkDarkParticleActivity = "neutral" | "active" | "inactive"

export interface BulkDarkParticle {
  darkParticleId: number
  parentDarkParticleId: number | null
  darkParticleKind: BulkDarkParticleKind
  src: string | null
  metaSrc: string | null
  label: string
  depth: number
  darkParticleOrder: number
  localX: number
  localY: number
  localZ: number
  torusScale: number
  torusRadius: number
  torusTube: number
  colorR: number
  colorG: number
  colorB: number
  activity?: BulkDarkParticleActivity
}

export interface BulkFieldParticle {
  fieldParticleId: number
  fieldId: number
  parentDarkParticleId: number
  fieldKey: string
  fieldLabel: string
  fieldParticleKind: BulkFieldParticleKind
  valueText: string | null
  localX: number
  localY: number
  localZ: number
  sphereRadius: number
  colorR: number
  colorG: number
  colorB: number
}

export interface BulkManifest {
  rootSrc: string
  darkParticles: BulkDarkParticle[]
  fieldParticles: BulkFieldParticle[]
}

export interface BulkManifestSink {
  clearManifest(rootSrc: string): Promise<void> | void
  insertDarkParticle(rootSrc: string, particle: BulkDarkParticle): Promise<void> | void
  insertFieldParticle(rootSrc: string, particle: BulkFieldParticle): Promise<void> | void
}

export interface BulkFieldParticleInput {
  fieldParticleId: number
  fieldId: number
  fieldKey: string
  fieldLabel: string
  fieldParticleKind: BulkFieldParticleKind
  valueText: string | null
  colorR: number
  colorG: number
  colorB: number
}

export interface BulkDarkParticleInput {
  darkParticleId: number
  darkParticleKind: BulkDarkParticleKind
  src: string | null
  metaSrc: string | null
  label: string
  colorR: number
  colorG: number
  colorB: number
  activity?: BulkDarkParticleActivity
  fieldParticles: BulkFieldParticleInput[]
  children: BulkDarkParticleInput[]
}

export interface BulkFieldDefinition {
  type: "number" | "boolean" | "string" | "array<number>" | "array<string>" | "enum<string>" | "enum<number>"
  values?: unknown[]
}

export interface BulkFieldsDefinition {
  [key: string]: BulkFieldDefinition
}

export interface GravityRuntimeBinding {
  actorUuid: string
  fieldMap?: Record<string, string>
}

export interface RuntimeActorSnapshot {
  actorUuid: string
  fieldNames: string[]
  binding?: GravityRuntimeBinding
}

export interface StrongEntanglementField {
  fieldName: string
  fieldRef: string
  payloadUuids: string[]
  semanticKeys: string[]
  representativeActorUuid: string
}

export interface StrongMembershipEntanglementBlock {
  actorUuids: string[]
  scopeUuids: string[]
  semanticKeys: string[]
  fields: StrongEntanglementField[]
}

export interface StrongEntanglementPlan {
  blocks: StrongMembershipEntanglementBlock[]
}

export interface BulkLayoutSettings {
  orbitEdgeGapMm: number
  rootInnerDiameterMm: number
  rootSphereRadiusMm: number
}

export interface BulkLayoutSnapshotConfig {
  deepestFieldSphereRadiusMm: number
  nestingCoefficient: number
  packingDensityCoefficient: number
  rootOuterDiameterMm: number
  sphereMinScaleFactor: number
}

export interface BulkRenderSettings {
  animationEnabled: boolean
  detailDensityFactor: number
  detailLevelMultiplier: number
  labelVisibleLevels: number
  baseDepth: number
  labelFontSizeMm: number
  labelSurfaceOffsetMm: number
  torusCrossRingRotationDeg: number
  torusRadialSegments: number
  torusTubularSegments: number
  wireframeOpacity: number
}

export interface BulkSettingsConfig {
  src: string
  layout: BulkLayoutSettings
  render: BulkRenderSettings
}

export interface SettingsSnapshot {
  src: string
  layoutSettings: Partial<BulkLayoutSettings>
  renderSettings: Partial<BulkRenderSettings>
}

export interface SettingsIndexedDbOptions {
  databaseName?: string
  indexedDb?: IDBFactory
}

export interface PersistedSettingsRecord extends SettingsSnapshot {
  id: string
  revision: number
}

export interface LevelGeometrySettings {
  rootInnerDiameterMm: number
  rootSphereRadiusMm: number
  rootOuterDiameterMm: number
  nestingCoefficient: number
  packingDensityCoefficient: number
  sphereMinScaleFactor: number
}

export interface LevelDetailSettings {
  detailDensityFactor: number
  detailLevelMultiplier: number
  torusRadialSegments: number
  torusTubularSegments: number
  torusMaxSegments: number
  sphereBaseWidthSegments: number
  sphereBaseHeightSegments: number
  sphereMaxWidthSegments: number
  sphereMaxHeightSegments: number
}

export interface LevelLabelSettings {
  baseDepth: number
  fontSizeMm: number
  surfaceOffsetMm: number
  visibleLevels: number
}

export interface LevelSettings {
  geometry: LevelGeometrySettings
  detail: LevelDetailSettings
  label: LevelLabelSettings
}

export interface LevelDetail {
  depth: number
  detailMultiplier: number
  torusRadialSegments: number
  torusTubularSegments: number
  sphereWidthSegments: number
  sphereHeightSegments: number
}

export interface LevelGeometry {
  depth: number
  levelScale: number
  outerDiameterMm: number
  outerRadiusMm: number
  innerDiameterMm: number
  innerRadiusMm: number
  shellRadiusMm: number
  shellTubeMm: number
  thicknessMm: number
  workingThicknessMm: number
  paddingMm: number
  maxObjectDiameterMm: number
  sphereDiameterMm: number
  sphereRadiusMm: number
  sphereMinDiameterMm: number
  sphereMaxDiameterMm: number
  nestingCoefficient: number
  packingDensityCoefficient: number
}

export interface ResolveLevelGeometryOptions {
  depth: number
  settings: LevelGeometrySettings
  outerRadiusMm?: number
}

export interface LevelLabel {
  depth: number
  isVisible: boolean
  fontSizeMm: number
  surfaceOffsetMm: number
}

export interface BulkActorRecord {
  uuid: string
  src: string
  parentUuid: string | null
  orderKey: Uint8Array
  status: "pending" | "active" | "deleted"
}

export interface ExecuteParams {
  action: Function
  self?: { atom: string; meta: string; path: string }
  field?: Record<string, unknown>
  value?: Record<string, unknown>
  mass?: Record<string, unknown>
}

export interface ProcessConfig {
  src: string
  importSpecifier?: string
}

export type ActionFn<ɸ = Record<string, unknown>, m = Record<string, unknown>, Res = unknown> = (params: {
  self: { atom: string; meta: string; path: string }
  field: ɸ
  value: Record<string, unknown>
  mass: m
}) => Res | Promise<Res>

export interface WeakStoreState {
  processes: Map<string, unknown>
}
