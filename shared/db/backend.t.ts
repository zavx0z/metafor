import type {
  SharedDbData,
  SharedDbEntanglementFieldMemberRecord,
  SharedDbEntanglementFieldRecord,
  SharedDbEntanglementMemberRecord,
  SharedDbEntanglementRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbMetaFieldRecord,
  SharedDbMetaMatterEdgeRecord,
  SharedDbMetaMatterNodeRecord,
  SharedDbMetaProcessReadRecord,
  SharedDbMetaProcessRecord,
  SharedDbMetaProcessWriteRecord,
  SharedDbMetaReactionReadRecord,
  SharedDbMetaReactionRecord,
  SharedDbMetaReactionStateRecord,
  SharedDbMetaReactionWriteRecord,
  SharedDbMetaRecord,
  SharedDbMetaStateRecord,
  SharedDbMetaTransitionConditionRecord,
  SharedDbMetaTransitionRecord,
  SharedDbWimpEdgeRecord,
  SharedDbWimpFieldRecord,
  SharedDbWimpRecord,
  SharedDbWimpStateRecord,
} from "./db.t.ts"

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

export interface SharedDbMetaRows {
  meta: SharedDbMetaRecord
  fields: SharedDbMetaFieldRecord[]
  states: SharedDbMetaStateRecord[]
  transitions: SharedDbMetaTransitionRecord[]
  transitionConditions: SharedDbMetaTransitionConditionRecord[]
  processes: SharedDbMetaProcessRecord[]
  processReads: SharedDbMetaProcessReadRecord[]
  processWrites: SharedDbMetaProcessWriteRecord[]
  reactions: SharedDbMetaReactionRecord[]
  reactionStates: SharedDbMetaReactionStateRecord[]
  reactionReads: SharedDbMetaReactionReadRecord[]
  reactionWrites: SharedDbMetaReactionWriteRecord[]
  matterNodes: SharedDbMetaMatterNodeRecord[]
  matterEdges: SharedDbMetaMatterEdgeRecord[]
}

export interface SharedDbWimpRows {
  wimp: SharedDbWimpRecord
  fields: SharedDbWimpFieldRecord[]
  values: SharedDbFieldValueRecord[]
  sources: SharedDbFieldSourceRecord[]
  state: SharedDbWimpStateRecord
}

export interface SharedDbEntanglementRows {
  entanglements: SharedDbEntanglementRecord[]
  members: SharedDbEntanglementMemberRecord[]
  fields: SharedDbEntanglementFieldRecord[]
  fieldMembers: SharedDbEntanglementFieldMemberRecord[]
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
  writeData(data: SharedDbData): void
  /** Записывает весь meta-level canonical row group для одной меты. */
  writeMetaRows(rows: SharedDbMetaRows): void
  /** Записывает весь instance-level canonical row group для одного wimp. */
  writeWimpRows(rows: SharedDbWimpRows): void
  /** Полностью заменяет structural `wimp_edges` snapshot текущего materialization-прохода. */
  replaceWimpEdges(rows: SharedDbWimpEdgeRecord[]): void
  /** Полностью заменяет текущий canonical entanglement snapshot. */
  replaceEntanglementRows(rows: SharedDbEntanglementRows): void
  setFieldValue(wimpFieldId: string, value: unknown): void
}
