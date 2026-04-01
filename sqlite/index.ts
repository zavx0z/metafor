import type { Database } from "bun:sqlite"
import { readFileSync } from "node:fs"

export const metaforDslTableNames = [
  "meta",
  "field",
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
  "state",
  "transition",
  "condition",
  "process",
  "process_action",
  "process_finally",
  "process_env",
  "process_action_read",
  "process_action_write",
  "process_finally_read",
  "reaction",
  "reaction_state",
  "reaction_read",
  "reaction_write",
  "particle",
  "wimp",
  "fuzzy",
  "fuzzy_condition",
  "fuzzy_meta",
  "axion",
  "macho",
] as const

export const metaforDslIndexNames = [
  "field_by_meta_src",
  "field_array_default_by_meta_src",
  "field_array_default_item_by_meta_src",
  "field_enum_variant_by_meta_src",
  "field_enum_default_by_meta_src",
  "state_by_meta_src",
  "transition_by_meta_src",
  "condition_by_meta_src",
  "process_by_meta_src",
  "process_action_by_meta_src",
  "process_finally_by_meta_src",
  "process_env_by_meta_src",
  "process_action_read_by_meta_src",
  "process_action_write_by_meta_src",
  "process_finally_read_by_meta_src",
  "reaction_by_meta_src",
  "reaction_state_by_meta_src",
  "reaction_read_by_meta_src",
  "reaction_write_by_meta_src",
  "particle_by_meta_src",
  "fuzzy_by_meta_src",
  "root_order",
  "child_order",
] as const

export type MetaforDslDatabase = Pick<Database, "run">

export const metaforDslSchemaSqlFile = new URL("./ddl.sql", import.meta.url)
export const metaforDslSchemaSql = readFileSync(metaforDslSchemaSqlFile, "utf8").trim()

export const initializeMetaforDslSqliteSchema = (database: MetaforDslDatabase): void => {
  database.run("PRAGMA foreign_keys = ON;")
  database.run("PRAGMA journal_mode = WAL;")
  database.run(metaforDslSchemaSql)
}
