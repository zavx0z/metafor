import type { Database } from "bun:sqlite"
import { readFileSync } from "node:fs"

export const metaforDslTableNames = [
  "metas",
  "fields",
  "field_string_defaults",
  "field_number_defaults",
  "field_boolean_defaults",
  "field_array_defaults",
  "field_enum_variants",
  "field_enum_defaults",
  "states",
  "transitions",
  "transition_conditions",
  "processes",
  "process_envs",
  "process_reads",
  "process_writes",
  "reactions",
  "reaction_states",
  "reaction_reads",
  "reaction_writes",
  "matter_nodes",
  "matter_map_nodes",
  "matter_condition_nodes",
  "matter_logical_nodes",
  "matter_text_nodes",
  "matter_element_nodes",
  "matter_meta_nodes",
] as const

export const metaforDslIndexNames = [
  "fields_by_meta",
  "states_by_meta",
  "transitions_by_meta",
  "transition_conditions_by_meta",
  "processes_by_meta",
  "process_envs_by_meta",
  "process_reads_by_meta",
  "process_writes_by_meta",
  "reactions_by_meta",
  "reaction_states_by_meta",
  "reaction_reads_by_meta",
  "reaction_writes_by_meta",
  "matter_nodes_by_meta",
  "matter_root_order",
  "matter_child_order",
] as const

export type MetaforDslDatabase = Pick<Database, "run">

export const metaforDslSchemaSqlFile = new URL("./ddl.sql", import.meta.url)
export const metaforDslSchemaSql = readFileSync(metaforDslSchemaSqlFile, "utf8").trim()

export const initializeMetaforDslSqliteSchema = (database: MetaforDslDatabase): void => {
  database.run(metaforDslSchemaSql)
}
