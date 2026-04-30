export type BindingValue =
  | string
  | {
      data?: string | string[]
      expr?: string
    }

export type ParticleKind = "wimp" | "fuzzy" | "axion" | "macho"
export type EdgeSlot = "root" | "child" | "then" | "else" | "branch"
export type FieldUuidByKey = Map<string, string>

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

export type MatterRelationBindingValue = BindingValue
export type MatterRelationChildEdgeSlot = Exclude<EdgeSlot, "root">

export interface MatterRelationChild {
  edgeSlot: MatterRelationChildEdgeSlot
  particle: MatterRelationParticle
}

export interface MatterRelationWimp {
  kind: "wimp"
  src: string
  fieldsBinding?: MatterRelationBindingValue
  massBinding?: MatterRelationBindingValue
  children?: MatterRelationChild[]
}

export interface MatterRelationFuzzy {
  kind: "fuzzy"
  fuzzyKind: "dynamic-meta" | "cond"
  predicateBinding?: MatterRelationBindingValue
  children?: MatterRelationChild[]
}

export interface MatterRelationAxion {
  kind: "axion"
  predicateBinding: MatterRelationBindingValue
  children?: MatterRelationChild[]
}

export interface MatterRelationMacho {
  kind: "macho"
  collectionBinding: MatterRelationBindingValue
  children?: MatterRelationChild[]
}

export type MatterRelationParticle =
  | MatterRelationWimp
  | MatterRelationFuzzy
  | MatterRelationAxion
  | MatterRelationMacho
