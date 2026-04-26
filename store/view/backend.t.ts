import type {
  DbEntanglementFamilyRows,
  DbFieldSourceRecord,
  DbFieldValueRecord,
  DbWimpEdgeRecord,
  DbWimpFieldRecord,
  DbWimpRows,
} from "./types.t.ts"

/**
 * Имена view-таблиц canonical relational DB.
 *
 * Префикс отсутствует исторически (view_wimps, view_wimp_fields, ...). После полного выезда
 * meta-слоя на свой пакет имена будут переименованы в `view_*` отдельным коммитом.
 */
export type DbViewBackendTableName =
  | "view_wimps"
  | "view_wimp_fields"
  | "view_wimp_edges"
  | "view_field_values"
  | "view_field_sources"
  | "view_wimp_states"
  | "view_entanglements"
  | "view_entanglement_members"
  | "view_entanglement_fields"
  | "view_entanglement_field_members"

export interface DbViewBackendIndexSpec {
  name: string
  table: DbViewBackendTableName
  columns: readonly string[]
  unique: boolean
}

export type DbViewBackendAwaitable<T> = T | Promise<T>

/**
 * Минимальный backend-контракт view-проекции canonical relational DB.
 *
 * Хранит только actor-level entity/relation-таблицы (view_wimps + entanglement family).
 * Meta-слой живёт отдельно в `store/db` пока что и не покрывается этим контрактом.
 */
export interface DbViewBackend {
  readonly requiredIndexes: readonly DbViewBackendIndexSpec[]

  close(): DbViewBackendAwaitable<void>
  reset(): DbViewBackendAwaitable<void>
  flush(): Promise<void>

  /**
   * Operational addressable read path.
   *
   * Эти методы должны читать только затронутые row groups и relation rows,
   * без полного dump-а backend state в память.
   */
  listWimpIds(): Promise<string[]>
  readWimpRows(wimpId: string): Promise<DbWimpRows | null>
  readWimpField(wimpFieldId: string): Promise<DbWimpFieldRecord | null>
  readWimpEdge(childWimpId: string): Promise<DbWimpEdgeRecord | null>
  readFieldValue(wimpFieldId: string): Promise<DbFieldValueRecord | null>
  readFieldSource(childWimpFieldId: string): Promise<DbFieldSourceRecord | null>
  readEntanglementFamily(entanglementId: string): Promise<DbEntanglementFamilyRows | null>

  /** Записывает весь actor-level canonical row group для одного wimp. */
  writeWimpRows(rows: DbWimpRows): DbViewBackendAwaitable<void>
  /** Записывает structural parent/child relation для одного wimp. */
  writeWimpEdge(row: DbWimpEdgeRecord): DbViewBackendAwaitable<void>
  /** Удаляет одну canonical entanglement-family, если она локально опустела. */
  deleteEntanglementFamily(entanglementId: string): DbViewBackendAwaitable<void>
  /** Записывает одну canonical source-family entanglement без глобального rebuild. */
  writeEntanglementFamily(rows: DbEntanglementFamilyRows): DbViewBackendAwaitable<void>
  setFieldValue(wimpFieldId: string, value: unknown): DbViewBackendAwaitable<void>
  setWimpState(wimpId: string, metaStateId: string): DbViewBackendAwaitable<void>
}

/**
 * View-уровневые индексы canonical relational DB.
 *
 * Применяются всеми view-backend имплементациями (sqlite, idb).
 */
export const dbViewRequiredBackendIndexes: readonly DbViewBackendIndexSpec[] = [
  { name: "wimps_by_wimp_order", table: "view_wimps", columns: ["wimpOrder"], unique: true },
  { name: "wimps_by_meta_id", table: "view_wimps", columns: ["metaId"], unique: false },
  { name: "wimp_fields_by_owner_wimp", table: "view_wimp_fields", columns: ["ownerWimpId"], unique: false },
  {
    name: "wimp_fields_by_owner_and_meta_field",
    table: "view_wimp_fields",
    columns: ["ownerWimpId", "metaFieldId"],
    unique: true,
  },
  {
    name: "wimp_fields_by_owner_and_field_order",
    table: "view_wimp_fields",
    columns: ["ownerWimpId", "fieldOrder"],
    unique: true,
  },
  { name: "wimp_edges_by_child", table: "view_wimp_edges", columns: ["childWimpId"], unique: true },
  { name: "wimp_edges_by_parent_and_order", table: "view_wimp_edges", columns: ["parentWimpId", "edgeOrder"], unique: false },
  { name: "field_values_by_owner_wimp_field", table: "view_field_values", columns: ["ownerWimpFieldId"], unique: true },
  { name: "field_sources_by_child_wimp_field", table: "view_field_sources", columns: ["childWimpFieldId"], unique: true },
  {
    name: "field_sources_by_parent_wimp_field",
    table: "view_field_sources",
    columns: ["parentWimpFieldId"],
    unique: false,
  },
  { name: "wimp_states_by_owner", table: "view_wimp_states", columns: ["ownerWimpId"], unique: true },
  { name: "entanglements_by_membership_key", table: "view_entanglements", columns: ["membershipKey"], unique: false },
  {
    name: "entanglement_members_by_owner_entanglement",
    table: "view_entanglement_members",
    columns: ["ownerEntanglementId"],
    unique: false,
  },
  {
    name: "entanglement_members_by_owner_and_order",
    table: "view_entanglement_members",
    columns: ["ownerEntanglementId", "memberOrder"],
    unique: true,
  },
  {
    name: "entanglement_fields_by_owner_entanglement",
    table: "view_entanglement_fields",
    columns: ["ownerEntanglementId"],
    unique: false,
  },
  {
    name: "entanglement_fields_by_owner_and_order",
    table: "view_entanglement_fields",
    columns: ["ownerEntanglementId", "fieldOrder"],
    unique: true,
  },
  {
    name: "entanglement_field_members_by_owner_field",
    table: "view_entanglement_field_members",
    columns: ["ownerEntanglementFieldId"],
    unique: false,
  },
  {
    name: "entanglement_field_members_by_owner_and_order",
    table: "view_entanglement_field_members",
    columns: ["ownerEntanglementFieldId", "memberOrder"],
    unique: true,
  },
] as const
