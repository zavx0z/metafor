import type {
  DbData,
  DbEntanglementFieldMemberRecord,
  DbEntanglementFieldRecord,
  DbEntanglementMemberRecord,
  DbEntanglementRecord,
  DbFieldSourceRecord,
  DbFieldValueRecord,
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
  DbWimpEdgeRecord,
  DbWimpFieldRecord,
  DbWimpRecord,
  DbWimpStateRecord,
} from "./db.t.ts"

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

export interface DbWimpRows {
  wimp: DbWimpRecord
  fields: DbWimpFieldRecord[]
  values: DbFieldValueRecord[]
  sources: DbFieldSourceRecord[]
  state: DbWimpStateRecord
}

export interface DbEntanglementFamilyRows {
  entanglement: DbEntanglementRecord
  members: DbEntanglementMemberRecord[]
  field: DbEntanglementFieldRecord
  fieldMembers: DbEntanglementFieldMemberRecord[]
}

export type DbBackendAwaitable<T> = T | Promise<T>

/**
 * Минимальный backend-контракт канонической relational DB.
 *
 * Backend хранит только relational entity/relation tables.
 * Любой downstream adapter/index-space строится уже после `readData()` в CPU memory.
 */
export interface DbBackend {
  readonly requiredIndexes: readonly DbBackendIndexSpec[]

  /**
   * Full dump / debug / bootstrap path.
   *
   * Это не основной operational API backend-а: полный снимок остаётся
   * режимом для round-trip проверки, bootstrap и общей CPU-side проекции.
   *
   * Для async backend-ов вроде `IndexedDB` этот dump должен отражать уже
   * persisted backend state, а не локально мутируемый shadow-cache.
   */
  close(): DbBackendAwaitable<void>
  reset(): DbBackendAwaitable<void>
  flush(): Promise<void>
  readData(): DbData

  /**
   * Operational addressable read path.
   *
   * Эти методы должны читать только затронутые row groups и relation rows,
   * а не требовать полного `readData()` как основной способ работы.
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
  /** Записывает весь instance-level canonical row group для одного wimp. */
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
