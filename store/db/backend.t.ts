import type {
  DbMetaFieldRecord,
  DbMetaMatterEdgeRecord,
  DbMetaMatterNodeRecord,
  DbMetaProcessReadRecord,
  DbMetaProcessRecord,
  DbMetaProcessWriteRecord,
  DbMetaReactionReadRecord,
  DbMetaReactionRecord,
  DbMetaReactionStateRecord,
  DbMetaReactionWriteRecord,
  DbMetaRecord,
  DbMetaStateRecord,
  DbMetaTransitionConditionRecord,
  DbMetaTransitionRecord,
} from "./db.t.ts"
import type {
  DbEntanglementFamilyRows,
  DbFieldSourceRecord,
  DbFieldValueRecord,
  DbWimpEdgeRecord,
  DbWimpFieldRecord,
  DbWimpRows,
} from "../view/types.t.ts"

export type { DbEntanglementFamilyRows, DbWimpRows }

export type DbBackendTableName =
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

export interface DbBackendIndexSpec {
  name: string
  table: DbBackendTableName
  columns: readonly string[]
  unique: boolean
}

export interface DbMetaRows {
  meta: DbMetaRecord
  fields: DbMetaFieldRecord[]
  states: DbMetaStateRecord[]
  transitions: DbMetaTransitionRecord[]
  transitionConditions: DbMetaTransitionConditionRecord[]
  processes: DbMetaProcessRecord[]
  processReads: DbMetaProcessReadRecord[]
  processWrites: DbMetaProcessWriteRecord[]
  reactions: DbMetaReactionRecord[]
  reactionStates: DbMetaReactionStateRecord[]
  reactionReads: DbMetaReactionReadRecord[]
  reactionWrites: DbMetaReactionWriteRecord[]
  matterNodes: DbMetaMatterNodeRecord[]
  matterEdges: DbMetaMatterEdgeRecord[]
}

export type DbBackendAwaitable<T> = T | Promise<T>

/**
 * Минимальный backend-контракт канонической relational DB.
 *
 * Backend хранит только relational entity/relation tables.
 * Operational path должен идти через адресные read/write методы, без full-dump cache.
 */
export interface DbBackend {
  readonly requiredIndexes: readonly DbBackendIndexSpec[]

  close(): DbBackendAwaitable<void>
  reset(): DbBackendAwaitable<void>
  flush(): Promise<void>

  /**
   * Operational addressable read path.
   *
   * Эти методы должны читать только затронутые row groups и relation rows,
   * без полного dump-а backend state в память.
   */
  readMetaRows(metaId: string): Promise<DbMetaRows | null>
  listWimpIds(): Promise<string[]>
  readWimpRows(wimpId: string): Promise<DbWimpRows | null>
  readWimpField(wimpFieldId: string): Promise<DbWimpFieldRecord | null>
  readWimpEdge(childWimpId: string): Promise<DbWimpEdgeRecord | null>
  readFieldValue(wimpFieldId: string): Promise<DbFieldValueRecord | null>
  readFieldSource(childWimpFieldId: string): Promise<DbFieldSourceRecord | null>
  readEntanglementFamily(entanglementId: string): Promise<DbEntanglementFamilyRows | null>

  /** Записывает весь meta-level canonical row group для одной меты. */
  writeMetaRows(rows: DbMetaRows): DbBackendAwaitable<void>
  /** Записывает весь actor-level canonical row group для одного wimp. */
  writeWimpRows(rows: DbWimpRows): DbBackendAwaitable<void>
  /** Записывает structural parent/child relation для одного wimp. */
  writeWimpEdge(row: DbWimpEdgeRecord): DbBackendAwaitable<void>
  /** Удаляет одну canonical entanglement-family, если она локально опустела. */
  deleteEntanglementFamily(entanglementId: string): DbBackendAwaitable<void>
  /** Записывает одну canonical source-family entanglement без глобального rebuild. */
  writeEntanglementFamily(rows: DbEntanglementFamilyRows): DbBackendAwaitable<void>
  setFieldValue(wimpFieldId: string, value: unknown): DbBackendAwaitable<void>
  setWimpState(wimpId: string, metaStateId: string): DbBackendAwaitable<void>
}
