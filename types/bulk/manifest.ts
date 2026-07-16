export type BulkDarkParticleKind = "atom" | "wimp" | "fuzzy" | "macho" | "axion"

export type BulkOrdinaryFieldKind = "string" | "number" | "boolean"

export type BulkLegacyFieldKind = "enum" | "array" | "other"

export type BulkFieldParticleKind = BulkOrdinaryFieldKind | BulkLegacyFieldKind

export type BulkDarkParticleActivity = "neutral" | "active" | "inactive"

export interface BulkDarkParticle {
  darkParticleId: number
  parentDarkParticleId: number | null
  darkParticleKind: BulkDarkParticleKind
  /** WIMP declaration source materialized by this Atom. */
  src: string | null
  /** Meta source backing the Atom's WIMP declaration. */
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
  /** Stable occurrence identity: one declared Field inside one manifested Atom. */
  fieldParticleId: string
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

export type BulkOrbitalParticleKind = "state" | "process" | "reaction" | "axion" | "finally"

/** A persistent declaration occurrence in an Atom's visible causal shell. */
export interface BulkOrbitalParticle {
  orbitalParticleId: string
  sourceId: number
  parentDarkParticleId: number
  orbitalParticleKind: BulkOrbitalParticleKind
  label: string
  current: boolean
  active: boolean
  sleeveRootStateId: number | null
  relatedStateIds: number[]
  localX: number
  localY: number
  localZ: number
  sphereRadius: number
  colorR: number
  colorG: number
  colorB: number
}

/** A real declared Transition and the condition Fields that permit it. */
export interface BulkTransitionChannel {
  transitionChannelId: string
  sourceId: number
  parentDarkParticleId: number
  fromOrbitalParticleId: string
  toOrbitalParticleId: string
  conditionIds: number[]
  conditionFieldIds: number[]
  active: boolean
  colorR: number
  colorG: number
  colorB: number
}

/** A virtual projection of one real nucleus Field on a State-electron surface. */
export interface BulkFieldProxy {
  fieldProxyId: string
  fieldParticleId: string
  fieldId: number
  parentDarkParticleId: number
  stateOrbitalParticleId: string
  localX: number
  localY: number
  localZ: number
  ringRadius: number
  colorR: number
  colorG: number
  colorB: number
}

export type BulkRelationEndpointKind = "field" | "field-proxy" | "orbital"

/** A real dependency rendered as one directed elliptic channel. */
export interface BulkRelationChannel {
  relationChannelId: string
  parentDarkParticleId: number
  relationKind: "field-projection" | "process-read" | "process-write" | "reaction-read" | "reaction-write" | "axion-read"
  fromKind: BulkRelationEndpointKind
  fromId: string
  toKind: BulkRelationEndpointKind
  toId: string
  active: boolean
  colorR: number
  colorG: number
  colorB: number
}

export interface BulkManifest {
  rootSrc: string
  darkParticles: BulkDarkParticle[]
  fieldParticles: BulkFieldParticle[]
  orbitalParticles?: BulkOrbitalParticle[]
  transitionChannels?: BulkTransitionChannel[]
  fieldProxies?: BulkFieldProxy[]
  relationChannels?: BulkRelationChannel[]
}

export interface BulkManifestSink {
  clearManifest(rootSrc: string): Promise<void> | void
  insertDarkParticle(rootSrc: string, particle: BulkDarkParticle): Promise<void> | void
  insertFieldParticle(rootSrc: string, particle: BulkFieldParticle): Promise<void> | void
}

export interface BulkFieldParticleInput {
  fieldParticleId: string
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
  /** WIMP declaration source materialized by this Atom. */
  src: string | null
  /** Meta source backing the Atom's WIMP declaration. */
  metaSrc: string | null
  label: string
  colorR: number
  colorG: number
  colorB: number
  activity?: BulkDarkParticleActivity
  orbitalComplexity?: {
    states: number
    transitions: number
    processes: number
    reactions: number
  }
  fieldParticles: BulkFieldParticleInput[]
  children: BulkDarkParticleInput[]
}
