import type { SharedDbData } from "./db.t.ts"

export type SharedDbBackendTableName =
  | "metas"
  | "meta_fields"
  | "meta_states"
  | "meta_transitions"
  | "meta_transition_conditions"
  | "meta_processes"
  | "meta_process_reads"
  | "meta_process_writes"
  | "meta_reactions"
  | "meta_reaction_states"
  | "meta_reaction_reads"
  | "meta_reaction_writes"
  | "meta_matter_nodes"
  | "meta_matter_edges"
  | "wimps"
  | "wimp_fields"
  | "wimp_edges"
  | "field_values"
  | "field_sources"
  | "wimp_states"
  | "entanglements"
  | "entanglement_members"
  | "entanglement_fields"
  | "entanglement_field_members"

export interface SharedDbBackendIndexSpec {
  name: string
  table: SharedDbBackendTableName
  columns: readonly string[]
  unique: boolean
}

/**
 * Минимальный backend-контракт канонической relational DB.
 *
 * Backend хранит только relational entity/relation tables.
 * Любой downstream adapter/index-space строится уже после `readData()` в CPU memory.
 */
export interface SharedDbBackend {
  readonly requiredIndexes: readonly SharedDbBackendIndexSpec[]

  close(): void
  reset(): void
  readData(): SharedDbData
  replaceData(data: SharedDbData): void
  writeData(data: SharedDbData): void
  setFieldValue(wimpFieldId: string, value: unknown): void
}
