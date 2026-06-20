export type BindingValue =
  | string
  | {
      data?: string | string[]
      expr?: string
    }

export type ParticleKind = "wimp" | "fuzzy" | "axion" | "macho"
export type EdgeSlot = "root" | "child" | "then" | "else" | "branch"
export type FieldIdByKey = Map<string, number>

export type BindingRow = {
  id: number
  binding_kind: "static" | "variable" | "dynamic"
  literal_kind: "text" | "boolean" | null
  literal_text: string | null
  literal_boolean: number | null
  expr: string | null
}

export type ParticleRow = {
  id: number
  parent_particle: number | null
  particle_kind: "wimp" | "fuzzy" | "axion" | "macho"
  edge_slot: "root" | "child" | "then" | "else" | "branch"
  particle_order: number
}

export type WimpParticleRow = {
  particle: number
  src: string
  fields_binding: number | null
  mass_binding: number | null
}

export type FuzzyParticleRow = {
  particle: number
  fuzzy_kind: "dynamic-meta" | "cond"
  predicate_binding: number | null
}

export type AxionParticleRow = {
  particle: number
  predicate_binding: number
}

export type MachoParticleRow = {
  particle: number
  collection_binding: number
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
