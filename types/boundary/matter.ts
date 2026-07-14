import type { MatterEdgeSlot, MatterParticleKind } from "../metafor/matter.ts"

export interface MatterBindingRow {
  id: number
  binding_kind: "static" | "variable" | "dynamic"
  literal_kind: "text" | "boolean" | null
  literal_text: string | null
  literal_boolean: number | null
  expr: string | null
}

export interface MatterParticleRow {
  id: number
  parent_particle: number | null
  particle_kind: MatterParticleKind
  edge_slot: MatterEdgeSlot
  particle_order: number
}

export interface WimpParticleRow {
  particle: number
  src: string
  fields_binding: number | null
  mass_binding: number | null
}

export interface FuzzyParticleRow {
  particle: number
  fuzzy_kind: "dynamic-meta"
  predicate_binding: number
}

export interface AxionParticleRow {
  particle: number
  predicate_binding: number
}

export interface MachoParticleRow {
  particle: number
  collection_binding: number
}
