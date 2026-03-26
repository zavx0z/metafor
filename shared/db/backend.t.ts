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

export interface SharedDbEntanglementFamilyRows {
  entanglement: SharedDbEntanglementRecord
  members: SharedDbEntanglementMemberRecord[]
  field: SharedDbEntanglementFieldRecord
  fieldMembers: SharedDbEntanglementFieldMemberRecord[]
}

export type SharedDbBackendAwaitable<T> = T | Promise<T>

/**
 * Минимальный backend-контракт канонической relational DB.
 *
 * Backend хранит только relational entity/relation tables.
 * Любой downstream adapter/index-space строится уже после `readData()` в CPU memory.
 */
export interface SharedDbBackend {
  readonly requiredIndexes: readonly SharedDbBackendIndexSpec[]

  /**
   * Full dump / debug / bootstrap path.
   *
   * Это не основной operational API backend-а: полный снимок остаётся
   * режимом для round-trip проверки, bootstrap и общей CPU-side проекции.
   *
   * Для async backend-ов вроде `IndexedDB` этот dump должен отражать уже
   * persisted backend state, а не локально мутируемый shadow-cache.
   */
  close(): SharedDbBackendAwaitable<void>
  reset(): SharedDbBackendAwaitable<void>
  flush(): Promise<void>
  readData(): SharedDbData

  /**
   * Operational addressable read path.
   *
   * Эти методы должны читать только затронутые row groups и relation rows,
   * а не требовать полного `readData()` как основной способ работы.
   */
  readMetaRows(metaId: string): Promise<SharedDbMetaRows | null>
  listWimpIds(): Promise<string[]>
  readWimpRows(wimpId: string): Promise<SharedDbWimpRows | null>
  readWimpField(wimpFieldId: string): Promise<SharedDbWimpFieldRecord | null>
  readWimpEdge(childWimpId: string): Promise<SharedDbWimpEdgeRecord | null>
  readFieldValue(wimpFieldId: string): Promise<SharedDbFieldValueRecord | null>
  readFieldSource(childWimpFieldId: string): Promise<SharedDbFieldSourceRecord | null>
  readEntanglementFamily(entanglementId: string): Promise<SharedDbEntanglementFamilyRows | null>

  /** Записывает весь meta-level canonical row group для одной меты. */
  writeMetaRows(rows: SharedDbMetaRows): SharedDbBackendAwaitable<void>
  /** Записывает весь instance-level canonical row group для одного wimp. */
  writeWimpRows(rows: SharedDbWimpRows): SharedDbBackendAwaitable<void>
  /** Записывает structural parent/child relation для одного wimp. */
  writeWimpEdge(row: SharedDbWimpEdgeRecord): SharedDbBackendAwaitable<void>
  /** Удаляет одну canonical entanglement-family, если она локально опустела. */
  deleteEntanglementFamily(entanglementId: string): SharedDbBackendAwaitable<void>
  /** Записывает одну canonical source-family entanglement без глобального rebuild. */
  writeEntanglementFamily(rows: SharedDbEntanglementFamilyRows): SharedDbBackendAwaitable<void>
  setFieldValue(wimpFieldId: string, value: unknown): SharedDbBackendAwaitable<void>
  setWimpState(wimpId: string, metaStateId: string): SharedDbBackendAwaitable<void>
}
