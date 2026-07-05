export interface BulkFieldDefinition {
  type: "number" | "boolean" | "string" | "array<number>" | "array<string>" | "enum<string>" | "enum<number>"
  values?: unknown[]
}

export interface BulkFieldsDefinition {
  [key: string]: BulkFieldDefinition
}

export interface GravityRuntimeBinding {
  actorUuid: string
  fieldMap?: Record<string, string>
}

export interface RuntimeActorSnapshot {
  actorUuid: string
  fieldNames: string[]
  binding?: GravityRuntimeBinding
}
