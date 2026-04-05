import metaforSchemaSql from "../../metafor.sql" with {type: "text"}
import fieldsSchemaSql from "../../fields.sql" with {type: "text"}
import superpositionSchemaSql from "../../superposition.sql" with {type: "text"}
import processSchemaSql from "../../process.sql" with {type: "text"}
import actionSchemaSql from "../../action.sql" with {type: "text"}
import finallySchemaSql from "../../finally.sql" with {type: "text"}
import reactionsSchemaSql from "../../reactions.sql" with {type: "text"}
import matterSchemaSql from "../../matter.sql" with {type: "text"}
import {Database, constants} from "bun:sqlite"

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
 * Открывает или создает базу данных SQLite по указанному пути.
 *
 * Если файл базы данных уже существует, он будет открыт. Если нет — создан новый.
 * После открытия применяет DDL схему Metafor DSL (`CREATE TABLE IF NOT EXISTS`).
 * Также расширяет метод `close()` для корректного сброса WAL-логов и удаления временных файлов.
 *
 * @param path - Путь к файлу базы данных.
 * @returns Открытый экземпляр Database с инициализированной схемой.
 */
export function getMetaDB(path: string): Database {
  const db = new Database(path, { strict: true, create: true })

  db.run("PRAGMA foreign_keys = ON;")
  db.run("PRAGMA journal_mode = WAL;")
  db.run(metaforDslSchemaSql)

  const originalClose = db.close.bind(db)
  db.close = (throwOnError?: boolean) => {
    db.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0)
    db.run("PRAGMA wal_checkpoint(TRUNCATE);")
    return originalClose(throwOnError)
  }

  return db
}
