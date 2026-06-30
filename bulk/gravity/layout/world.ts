/** Runtime projection contract for Bulk visualization. */

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
  fieldOrder: number
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
