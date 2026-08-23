export interface BulkFieldDefinition {
  type: "number" | "boolean" | "string" | "array<number>" | "array<string>" | "enum<string>" | "enum<number>"
  values?: unknown[]
}

export interface BulkFieldsDefinition {
  [key: string]: BulkFieldDefinition
}

export interface GravityRuntimeBinding {
  atomUuid: string
  fieldMap?: Record<string, string>
}

export interface RuntimeAtomSnapshot {
  atomUuid: string
  fieldNames: string[]
  binding?: GravityRuntimeBinding
}
