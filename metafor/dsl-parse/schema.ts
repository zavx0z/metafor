import type { Database } from "bun:sqlite"

export const sectionOrder = ["fields", "superposition", "mass", "processes", "reactions", "matter", "bulk"] as const

export type SectionName = (typeof sectionOrder)[number]

export type FieldType = "string" | "boolean" | "number" | "array" | "enum"

export type FieldPresence = "optional" | "required" | null

export type LiteralType = "string" | "number" | "boolean" | "array"

export type ProcessBuilder = "process" | "destroy"

export type ProcessEnv = "browser" | "node" | "worker" | "server" | "any"

export type ProcessStep = "action" | "success" | "error" | "before"

export interface MetaRow {
  id: 1
  name: string
  configMultiline: boolean | null
}

export interface MetaConfigEntryRow {
  position: number
}

export interface MetaDescRow {
  position: number
  value: string
}

export interface MetaDevRow {
  position: number
  value: boolean
}

export interface SectionRow {
  name: SectionName
  params: string | null
  code: string | null
}

export interface FieldRow {
  id: number
  position: number
  name: string
}

export interface StringFieldRow {
  fieldId: number
}

export interface NumberFieldRow {
  fieldId: number
}

export interface BooleanFieldRow {
  fieldId: number
}

export interface ArrayFieldRow {
  fieldId: number
}

export interface EnumFieldRow {
  fieldId: number
}

export interface OptionalFieldRow {
  fieldId: number
  label: string | null
}

export interface RequiredFieldRow {
  fieldId: number
  label: string | null
}

export interface RequiredDefaultRow {
  fieldId: number
}

export interface RequiredStringDefaultRow {
  fieldId: number
  value: string
}

export interface RequiredNumberDefaultRow {
  fieldId: number
  value: string
}

export interface RequiredBooleanDefaultRow {
  fieldId: number
  value: boolean
}

export interface RequiredArrayDefaultRow {
  fieldId: number
}

export interface RequiredEnumDefaultRow {
  fieldId: number
  variantPosition: number
}

export interface EnumVariantRow {
  fieldId: number
  position: number
}

export interface EnumTextVariantRow {
  fieldId: number
  position: number
  value: string
}

export interface EnumNumberVariantRow {
  fieldId: number
  position: number
  value: string
}

export interface StateRow {
  id: number
  position: number
  name: string
}

export interface StateEntryRow {
  stateId: number
  position: number
}

export interface TransitionCommentRow {
  id: number
  stateId: number
  position: number
  text: string
}

export interface TransitionRow {
  id: number
  stateId: number
  targetStateId: number
  position: number
}

export interface ConditionRow {
  transitionId: number
  position: number
  fieldId: number
}

export interface NullConditionRow {
  transitionId: number
  position: number
  value: boolean
}

export interface ProcessRow {
  id: number
  position: number
  name: string
  gapBefore: number
  configMultiline: boolean | null
}

export interface ActionProcessRow {
  processId: number
}

export interface DestroyProcessRow {
  processId: number
}

export interface ProcessConfigEntryRow {
  processId: number
  position: number
}

export interface ProcessLabelRow {
  processId: number
  position: number
  value: string
}

export interface ProcessDescRow {
  processId: number
  position: number
  value: string
}

export interface ProcessEnvListRow {
  processId: number
  position: number
}

export interface ProcessEnvRow {
  processId: number
  position: number
  env: ProcessEnv
}

export interface ProcessHandlerEntryRow {
  processId: number
  position: number
}

export interface ProcessActionRow {
  processId: number
  position: number
  code: string
}

export interface ProcessSuccessRow {
  processId: number
  position: number
  code: string
}

export interface ProcessErrorRow {
  processId: number
  position: number
  code: string
}

export interface DestroyBeforeRow {
  processId: number
  position: number
  code: string
}

export interface ReactionRow {
  id: number
  position: number
  code: string
}

export const roundTripSchemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  configMultiline INTEGER CHECK (configMultiline IN (0, 1) OR configMultiline IS NULL)
);

CREATE TABLE IF NOT EXISTS meta_config_entries (
  position INTEGER PRIMARY KEY CHECK (position >= 0)
);

CREATE TABLE IF NOT EXISTS meta_descs (
  position INTEGER PRIMARY KEY CHECK (position >= 0),
  value TEXT NOT NULL,
  FOREIGN KEY (position) REFERENCES meta_config_entries(position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_devs (
  position INTEGER PRIMARY KEY CHECK (position >= 0),
  value INTEGER NOT NULL CHECK (value IN (0, 1)),
  FOREIGN KEY (position) REFERENCES meta_config_entries(position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sections (
  name TEXT PRIMARY KEY CHECK (name IN ('fields', 'superposition', 'mass', 'processes', 'reactions', 'matter', 'bulk')),
  params TEXT,
  code TEXT
);

CREATE TABLE IF NOT EXISTS fields (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS string_fields (
  fieldId INTEGER PRIMARY KEY,
  FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS number_fields (
  fieldId INTEGER PRIMARY KEY,
  FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS boolean_fields (
  fieldId INTEGER PRIMARY KEY,
  FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS array_fields (
  fieldId INTEGER PRIMARY KEY,
  FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS enum_fields (
  fieldId INTEGER PRIMARY KEY,
  FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS optional_fields (
  fieldId INTEGER PRIMARY KEY,
  label TEXT,
  FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS required_fields (
  fieldId INTEGER PRIMARY KEY,
  label TEXT,
  FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS required_defaults (
  fieldId INTEGER PRIMARY KEY,
  FOREIGN KEY (fieldId) REFERENCES required_fields(fieldId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS required_string_defaults (
  fieldId INTEGER PRIMARY KEY,
  value TEXT NOT NULL,
  FOREIGN KEY (fieldId) REFERENCES required_defaults(fieldId) ON DELETE CASCADE,
  FOREIGN KEY (fieldId) REFERENCES string_fields(fieldId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS required_number_defaults (
  fieldId INTEGER PRIMARY KEY,
  value TEXT NOT NULL,
  FOREIGN KEY (fieldId) REFERENCES required_defaults(fieldId) ON DELETE CASCADE,
  FOREIGN KEY (fieldId) REFERENCES number_fields(fieldId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS required_boolean_defaults (
  fieldId INTEGER PRIMARY KEY,
  value INTEGER NOT NULL CHECK (value IN (0, 1)),
  FOREIGN KEY (fieldId) REFERENCES required_defaults(fieldId) ON DELETE CASCADE,
  FOREIGN KEY (fieldId) REFERENCES boolean_fields(fieldId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS required_array_defaults (
  fieldId INTEGER PRIMARY KEY,
  FOREIGN KEY (fieldId) REFERENCES required_defaults(fieldId) ON DELETE CASCADE,
  FOREIGN KEY (fieldId) REFERENCES array_fields(fieldId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS enum_variants (
  fieldId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (fieldId, position),
  FOREIGN KEY (fieldId) REFERENCES enum_fields(fieldId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS enum_text_variants (
  fieldId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  value TEXT NOT NULL,
  PRIMARY KEY (fieldId, position),
  FOREIGN KEY (fieldId, position) REFERENCES enum_variants(fieldId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS enum_number_variants (
  fieldId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  value TEXT NOT NULL,
  PRIMARY KEY (fieldId, position),
  FOREIGN KEY (fieldId, position) REFERENCES enum_variants(fieldId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS required_enum_defaults (
  fieldId INTEGER PRIMARY KEY,
  variantPosition INTEGER NOT NULL CHECK (variantPosition >= 0),
  FOREIGN KEY (fieldId) REFERENCES required_defaults(fieldId) ON DELETE CASCADE,
  FOREIGN KEY (fieldId) REFERENCES enum_fields(fieldId) ON DELETE CASCADE,
  FOREIGN KEY (fieldId, variantPosition) REFERENCES enum_variants(fieldId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS states (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS state_entries (
  stateId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (stateId, position),
  FOREIGN KEY (stateId) REFERENCES states(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transition_comments (
  id INTEGER PRIMARY KEY,
  stateId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  text TEXT NOT NULL,
  UNIQUE (stateId, position),
  FOREIGN KEY (stateId, position) REFERENCES state_entries(stateId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transitions (
  id INTEGER PRIMARY KEY,
  stateId INTEGER NOT NULL,
  targetStateId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (stateId, position),
  FOREIGN KEY (stateId, position) REFERENCES state_entries(stateId, position) ON DELETE CASCADE,
  FOREIGN KEY (targetStateId) REFERENCES states(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conditions (
  transitionId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  fieldId INTEGER NOT NULL,
  PRIMARY KEY (transitionId, position),
  FOREIGN KEY (transitionId) REFERENCES transitions(id) ON DELETE CASCADE,
  FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS null_conditions (
  transitionId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  value INTEGER NOT NULL CHECK (value IN (0, 1)),
  PRIMARY KEY (transitionId, position),
  FOREIGN KEY (transitionId, position) REFERENCES conditions(transitionId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS processes (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
  name TEXT NOT NULL UNIQUE,
  gapBefore INTEGER NOT NULL CHECK (gapBefore >= 0),
  configMultiline INTEGER CHECK (configMultiline IN (0, 1) OR configMultiline IS NULL)
);

CREATE TABLE IF NOT EXISTS action_processes (
  processId INTEGER PRIMARY KEY,
  FOREIGN KEY (processId) REFERENCES processes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS destroy_processes (
  processId INTEGER PRIMARY KEY,
  FOREIGN KEY (processId) REFERENCES processes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_config_entries (
  processId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (processId, position),
  FOREIGN KEY (processId) REFERENCES processes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_labels (
  processId INTEGER PRIMARY KEY,
  position INTEGER NOT NULL CHECK (position >= 0),
  value TEXT NOT NULL,
  FOREIGN KEY (processId, position) REFERENCES process_config_entries(processId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_descs (
  processId INTEGER PRIMARY KEY,
  position INTEGER NOT NULL CHECK (position >= 0),
  value TEXT NOT NULL,
  FOREIGN KEY (processId, position) REFERENCES process_config_entries(processId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_env_lists (
  processId INTEGER PRIMARY KEY,
  position INTEGER NOT NULL CHECK (position >= 0),
  FOREIGN KEY (processId, position) REFERENCES process_config_entries(processId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_envs (
  processId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  env TEXT NOT NULL CHECK (env IN ('browser', 'node', 'worker', 'server', 'any')),
  PRIMARY KEY (processId, position),
  FOREIGN KEY (processId) REFERENCES process_env_lists(processId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_handler_entries (
  processId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (processId, position),
  FOREIGN KEY (processId) REFERENCES processes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_actions (
  processId INTEGER PRIMARY KEY,
  position INTEGER NOT NULL CHECK (position >= 0),
  code TEXT NOT NULL,
  FOREIGN KEY (processId) REFERENCES action_processes(processId) ON DELETE CASCADE,
  FOREIGN KEY (processId, position) REFERENCES process_handler_entries(processId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_successes (
  processId INTEGER PRIMARY KEY,
  position INTEGER NOT NULL CHECK (position >= 0),
  code TEXT NOT NULL,
  FOREIGN KEY (processId) REFERENCES action_processes(processId) ON DELETE CASCADE,
  FOREIGN KEY (processId, position) REFERENCES process_handler_entries(processId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_errors (
  processId INTEGER PRIMARY KEY,
  position INTEGER NOT NULL CHECK (position >= 0),
  code TEXT NOT NULL,
  FOREIGN KEY (processId) REFERENCES action_processes(processId) ON DELETE CASCADE,
  FOREIGN KEY (processId, position) REFERENCES process_handler_entries(processId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS destroy_befores (
  processId INTEGER PRIMARY KEY,
  position INTEGER NOT NULL CHECK (position >= 0),
  code TEXT NOT NULL,
  FOREIGN KEY (processId) REFERENCES destroy_processes(processId) ON DELETE CASCADE,
  FOREIGN KEY (processId, position) REFERENCES process_handler_entries(processId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
  code TEXT NOT NULL
);
`

export const ensureRoundTripSchema = (database: Database) => {
  database.exec(roundTripSchemaSql)
}
