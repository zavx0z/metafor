export type BindingRow = {
  uuid: string
  binding_kind: "static" | "variable" | "dynamic"
  literal_kind: "text" | "boolean" | null
  literal_text: string | null
  literal_boolean: number | null
  expr: string | null
}

export type ParticleRow = {
  uuid: string
  parent_particle: string | null
  particle_kind: "wimp" | "fuzzy" | "axion" | "macho"
  edge_slot: "root" | "child" | "then" | "else" | "branch"
  particle_order: number
}

export type WimpParticleRow = {
  particle: string
  src: string
  fields_binding: string | null
  mass_binding: string | null
}

export type FuzzyParticleRow = {
  particle: string
  fuzzy_kind: "dynamic-meta" | "cond"
  predicate_binding: string | null
}

export type AxionParticleRow = {
  particle: string
  predicate_binding: string
}

export type MachoParticleRow = {
  particle: string
  collection_binding: string
}
