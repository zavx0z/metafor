export type BulkDarkParticleKind = "atom" | "fuzzy" | "macho" | "axion"

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
  activity?: BulkDarkParticleActivity
}

export interface BulkFieldParticle {
  /** Stable occurrence identity: one declared Field inside one manifested Atom. */
  fieldParticleId: string
  fieldId: number
  /**
   * Canonical materialized Value identity. Equal non-null ids express one
   * direct shared Matter quantity even when the Field declarations differ.
   */
  valueId: number | null
  parentDarkParticleId: number
  fieldKey: string
  fieldLabel: string
  fieldParticleKind: BulkFieldParticleKind
  valueText: string | null
}

export type BulkOrbitalParticleKind = "state" | "process" | "reaction" | "axion" | "finally"

/**
 * A persistent declaration occurrence in an Atom's visible State sleeve.
 * Process/Finally declarations have one occurrence per exact related State
 * occurrence; `active` never controls their presence.
 */
export interface BulkOrbitalParticle {
  orbitalParticleId: string
  sourceId: number
  parentDarkParticleId: number
  orbitalParticleKind: BulkOrbitalParticleKind
  label: string
  current: boolean
  active: boolean
  /** Concrete State occurrence that owns this causal occurrence; null only for State itself. */
  anchorStateOrbitalParticleId: string | null
  sleeveRootStateId: number | null
  relatedStateIds: number[]
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
}

/** A virtual projection of one real nucleus Field on a State-electron surface. */
export interface BulkFieldProxy {
  fieldProxyId: string
  fieldParticleId: string
  fieldId: number
  parentDarkParticleId: number
  stateOrbitalParticleId: string
}

export type BulkRelationEndpointKind = "field" | "field-proxy" | "orbital"

/** A real dependency rendered as one directed Hermite channel. */
export interface BulkRelationChannel {
  relationChannelId: string
  parentDarkParticleId: number
  relationKind:
    | "field-entanglement"
    | "field-projection"
    | "process-read"
    | "process-write"
    | "reaction-read"
    | "reaction-write"
    | "axion-read"
  fromKind: BulkRelationEndpointKind
  fromId: string
  toKind: BulkRelationEndpointKind
  toId: string
  active: boolean
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

export interface BulkRenderColor {
  colorR: number
  colorG: number
  colorB: number
}

export interface BulkRenderDarkParticle
  extends BulkDarkParticle, BulkRenderColor {
  localX: number
  localY: number
  localZ: number
  torusRadius: number
  torusTube: number
}

export interface BulkRenderFieldParticle
  extends BulkFieldParticle, BulkRenderColor {
  localX: number
  localY: number
  localZ: number
  sphereRadius: number
}

export interface BulkRenderOrbitalParticle
  extends BulkOrbitalParticle, BulkRenderColor {
  localX: number
  localY: number
  localZ: number
}

export interface BulkRenderTransitionChannel
  extends BulkTransitionChannel, BulkRenderColor {}

export interface BulkRenderFieldProxy
  extends BulkFieldProxy, BulkRenderColor {
  localX: number
  localY: number
  localZ: number
}

export interface BulkRenderRelationChannel
  extends BulkRelationChannel, BulkRenderColor {}

/** Geometry-bearing viewport projection. Never persisted as manifestation. */
export interface BulkRenderManifest {
  rootSrc: string
  darkParticles: BulkRenderDarkParticle[]
  fieldParticles: BulkRenderFieldParticle[]
  orbitalParticles: BulkRenderOrbitalParticle[]
  transitionChannels: BulkRenderTransitionChannel[]
  fieldProxies: BulkRenderFieldProxy[]
  relationChannels: BulkRenderRelationChannel[]
}

/** Read-only evidence that a completed operation promoted one Atom into a captured root frame. */
export interface BulkRootPromotionReceipt {
  version: 1
  kind: "root-promotion"
  verified: true
  removedRootAtomId: number
  removedRootSrc: string
  promotedAtomId: number
  promotedRootSrc: string
  formerRootFrame: {
    localX: number
    localY: number
    localZ: number
    outerDiameterMm: number
  }
}
