import metaforSchemaSql from "./meta.sql" with {type: "text"}
import fieldsSchemaSql from "./fields.sql" with {type: "text"}
import superpositionSchemaSql from "./superposition.sql" with {type: "text"}
import processSchemaSql from "./process.sql" with {type: "text"}
import actionSchemaSql from "./action.sql" with {type: "text"}
import finallySchemaSql from "./finally.sql" with {type: "text"}
import reactionsSchemaSql from "./reactions.sql" with {type: "text"}
import matterSchemaSql from "./matter.sql" with {type: "text"}
import { SQL } from "bun"
import type { MetaDSL } from "../../../metafor.t"
import { createFields } from "./fields.C.ts"
import { createMatter } from "./matter.C.ts"
import { createMetafor } from "./meta.C.ts"
import { createProcess } from "./process.C.ts"
import { createReactions } from "./reactions.C.ts"
import { createSuperposition } from "./superposition.C.ts"

export const metaforDslTableNames = [
  "meta",
  "meta_mass_value",
  "field",
  "field_default",
  "field_string_default",
  "field_number_default",
  "field_boolean_default",
  "field_array_default_item",
  "field_enum_variant",
  "field_enum_default",
  "superposition",
  "transition",
  "condition",
  "condition_predicate",
  "condition_list_item",
  "process",
  "process_action",
  "process_finally",
  "process_env",
  "process_action_read",
  "process_action_write",
  "process_finally_read",
  "reaction",
  "reaction_superposition",
  "reaction_read",
  "reaction_write",
  "matter_binding",
  "matter_binding_dep",
  "matter_particle",
  "matter_particle_wimp",
  "matter_particle_fuzzy",
  "matter_particle_axion",
  "matter_particle_macho",
] as const

export const metaforDslIndexNames = [
  "meta_mass_root_by_meta",
  "meta_mass_object_entry",
  "meta_mass_array_entry",
  "meta_mass_by_meta",
  "meta_mass_by_parent",
  "field_by_meta",
  "superposition_by_meta",
  "condition_by_transition",
  "condition_predicate_by_condition",
  "condition_list_item_by_predicate",
  "process_by_meta",
  "process_env_by_process",
  "process_action_read_by_process",
  "process_action_write_by_process",
  "process_finally_read_by_process",
  "reaction_by_meta",
  "reaction_superposition_by_reaction",
  "reaction_read_by_reaction",
  "reaction_write_by_reaction",
  "matter_binding_by_meta",
  "matter_binding_dep_by_binding",
  "matter_root_particle_order",
  "matter_particle_child_order",
  "matter_particle_branch_slot",
  "matter_particle_by_meta",
  "matter_particle_by_parent",
] as const

const metaforDslSchemaSqlModules = [
  metaforSchemaSql,
  fieldsSchemaSql,
  superpositionSchemaSql,
  processSchemaSql,
  actionSchemaSql,
  finallySchemaSql,
  reactionsSchemaSql,
  matterSchemaSql,
] as const

export const metaforDslSchemaSql = metaforDslSchemaSqlModules
  .map((sql) => sql.trim())
  .filter(Boolean)
  .join("\n\n")
  .trim()

/**
 * Применяет DSL meta-схему (33 таблицы) к уже открытому SQL.
 *
 * Идемпотентно: каждое CREATE TABLE — IF NOT EXISTS. PRAGMA-настройки не
 * трогает (это ответственность владельца SQL).
 */
export async function initializeMetaDslSchema(sql: SQL): Promise<void> {
  await sql.unsafe(metaforDslSchemaSql)
}

/**
 * Открывает или создает базу данных SQLite по указанному пути.
 *
 * Если файл базы данных уже существует, он будет открыт. Если нет — создан новый.
 * После открытия применяет DDL схему Metafor DSL (`CREATE TABLE IF NOT EXISTS`).
 *
 * @param path - Путь к файлу базы данных.
 * @returns Открытый экземпляр SQL с инициализированной схемой.
 */
export async function open(path: string): Promise<SQL> {
  const sql = new SQL(`sqlite://${path}`)

  await sql.unsafe("PRAGMA foreign_keys = ON;")
  await sql.unsafe("PRAGMA journal_mode = WAL;")
  await initializeMetaDslSchema(sql)

  return sql
}

/**
 * Экспортирует структуру MetaDSL в реляционные таблицы SQLite.
 *
 * @param sql - Экземпляр базы данных SQL.
 * @param meta - Объект MetaDSL.
 * @param src - Уникальный идентификатор (source) атома.
 */

export async function create(sql: SQL, meta: MetaDSL, src: string): Promise<void> {
  await sql.begin(async (tx) => {
    await createMetafor(tx, meta, src)
    const fieldUuids = await createFields(tx, meta, src)
    const stateUuids = await createSuperposition(tx, meta, src, fieldUuids)
    await createProcess(tx, meta, src, fieldUuids)
    await createReactions(tx, meta, src, fieldUuids, stateUuids)
    await createMatter(tx, meta, src, fieldUuids)
  })
}
