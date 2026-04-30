
export type ScalarKind = "null" | "boolean" | "number" | "string" | "enum"

export type ValueKind = ScalarKind | "list"

export type Scalar =
  | { kind: "null" }
  | { kind: "boolean"; boolean: boolean }
  | { kind: "number"; number: number }
  | { kind: "string"; text: string }
    | { kind: "enum"; variant: string }

export type ValueRecord =
  | { uuid: string; kind: "null" }
  | { uuid: string; kind: "boolean"; boolean: boolean }
  | { uuid: string; kind: "number"; number: number }
  | { uuid: string; kind: "string"; text: string }
  | { uuid: string; kind: "enum"; variant: string }
  | { uuid: string; kind: "list" }

export interface ValueItemRecord {
  value: string
  position: number
    itemValue: string
}
