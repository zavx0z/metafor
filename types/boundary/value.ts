export interface AtomValueRecord {
  atom: number
  field: number
  value: number
}

export interface FieldEnumVariantRecord {
  id: number
  field: number
  position: number
  itemValue: string
}

export interface AtomStateRecord {
  atom: number
  metaState: number | null
}

export type ScalarKind = "null" | "boolean" | "number" | "string" | "enum"

export type ValueKind = ScalarKind | "list"

export type Scalar =
  | { kind: "null" }
  | { kind: "boolean"; boolean: boolean }
  | { kind: "number"; number: number }
  | { kind: "string"; text: string }
  | { kind: "enum"; variant: number }

export type ValueRecord =
  | { id: number; kind: "null" }
  | { id: number; kind: "boolean"; boolean: boolean }
  | { id: number; kind: "number"; number: number }
  | { id: number; kind: "string"; text: string }
  | { id: number; kind: "enum"; variant: number }
  | { id: number; kind: "list" }

export interface ValueItemRecord {
  value: number
  position: number
  itemValue: number
}
