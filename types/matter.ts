export type MatterBindingValue =
  | string
  | {
      data?: string | string[]
      expr?: string
    }

export type MatterParticleKind = "wimp" | "fuzzy" | "axion" | "macho"

export type MatterEdgeSlot = "root" | "child" | "then" | "else" | "branch"

export type MatterChildEdgeSlot = "child" | "then" | "else" | "branch"

export interface MatterChild {
  edgeSlot: MatterChildEdgeSlot
  particle: MatterParticle
}

export interface MatterWimp {
  kind: "wimp"
  src: string
  fieldsBinding?: MatterBindingValue
  massBinding?: MatterBindingValue
  children?: MatterChild[]
}

export interface MatterFuzzy {
  kind: "fuzzy"
  fuzzyKind: "dynamic-meta" | "cond"
  predicateBinding?: MatterBindingValue
  children?: MatterChild[]
}

export interface MatterAxion {
  kind: "axion"
  predicateBinding: MatterBindingValue
  children?: MatterChild[]
}

export interface MatterMacho {
  kind: "macho"
  collectionBinding: MatterBindingValue
  children?: MatterChild[]
}

export type MatterParticle = MatterWimp | MatterFuzzy | MatterAxion | MatterMacho
