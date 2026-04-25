export type BindingValue =
  | string
  | {
      data?: string | string[]
      expr?: string
    }

export type ParticleKind = "wimp" | "fuzzy" | "axion" | "macho"
export type EdgeSlot = "root" | "child" | "then" | "else" | "branch"
export type FieldUuidByKey = Map<string, string>
