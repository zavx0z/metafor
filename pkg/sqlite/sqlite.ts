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
  "field",
  "field_default",
  "field_string_default",
  "field_number_default",
  "field_boolean_default",
  "field_array_default",
  "field_array_default_item",
  "field_array_string_default_item",
  "field_array_number_default_item",
  "field_enum_variant",
  "field_enum_string_variant",
  "field_enum_number_variant",
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
  "matter_node",
  "matter_edge",
  "matter_binding",
  "matter_binding_dep",
  "matter_meta",
  "matter_condition",
  "matter_logical",
  "matter_map",
  "matter_attr",
  "matter_attr_binding",
  "matter_attr_part",
  "matter_style_prop",
  "matter_event_update",
] as const

export const metaforDslIndexNames = [
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
  "matter_root_order",
  "matter_child_order",
  "matter_cond_branch_slot",
  "matter_node_by_meta",
  "matter_edge_by_parent_node",
  "matter_binding_by_meta",
  "matter_binding_dep_by_binding",
  "matter_attr_by_owner_node",
  "matter_event_update_by_attr",
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
 * Открывает базу данных SQLite по указанному пути, инициализирует схему Metafor DSL
 * и расширяет метод close() для корректного сброса WAL.
 */
export function getMetaDB(path: string): Database {
  const database = new Database(path, { strict: true })

  database.run("PRAGMA foreign_keys = ON;")
  database.run("PRAGMA journal_mode = WAL;")
  database.run(metaforDslSchemaSql)

  const originalClose = database.close.bind(database)
  database.close = (throwOnError?: boolean) => {
    database.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0)
    database.run("PRAGMA wal_checkpoint(TRUNCATE);")
    return originalClose(throwOnError)
  }

  return database
}
