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
  desc: string | null
  descPosition: number | null
  dev: boolean | null
  devPosition: number | null
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
  type: FieldType
  required: boolean | null
  label: string | null
}

export interface FieldDefaultRow {
  fieldId: number
}

export interface StringFieldDefaultRow {
  fieldId: number
  value: string
}

export interface NumberFieldDefaultRow {
  fieldId: number
  value: string
}

export interface BooleanFieldDefaultRow {
  fieldId: number
  value: boolean
}

export interface ArrayFieldDefaultRow {
  fieldId: number
}

export interface EnumFieldDefaultRow {
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

export interface SuperpositionRow {
  id: number
  position: number
  name: string
}

export interface SuperpositionCommentRow {
  id: number
  superpositionId: number
  position: number
  text: string
}

export interface TransitionRow {
  id: number
  superpositionId: number
  targetSuperpositionId: number
  position: number
}

export interface ConditionRow {
  transitionId: number
  position: number
  fieldId: number
  nullValue: boolean
}

export interface ProcessRow {
  id: number
  position: number
  name: string
  builder: ProcessBuilder
  gapBefore: number
  configMultiline: boolean | null
  label: string | null
  labelPosition: number | null
  desc: string | null
  descPosition: number | null
  envPosition: number | null
}

export interface ProcessEnvRow {
  processId: number
  position: number
  env: ProcessEnv
}

export interface ProcessHandlerRow {
  processId: number
  position: number
  step: ProcessStep
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
  configMultiline INTEGER CHECK (configMultiline IN (0, 1) OR configMultiline IS NULL),
  desc TEXT,
  descPosition INTEGER CHECK (descPosition >= 0 OR descPosition IS NULL),
  dev INTEGER CHECK (dev IN (0, 1) OR dev IS NULL),
  devPosition INTEGER CHECK (devPosition >= 0 OR devPosition IS NULL),
  CHECK ((desc IS NULL) = (descPosition IS NULL)),
  CHECK ((dev IS NULL) = (devPosition IS NULL)),
  CHECK (descPosition IS NULL OR devPosition IS NULL OR descPosition <> devPosition)
);

CREATE TABLE IF NOT EXISTS sections (
  name TEXT PRIMARY KEY CHECK (name IN ('fields', 'superposition', 'mass', 'processes', 'reactions', 'matter', 'bulk')),
  params TEXT,
  code TEXT
);

CREATE TABLE IF NOT EXISTS fields (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('string', 'boolean', 'number', 'array', 'enum')),
  required INTEGER CHECK (required IN (0, 1) OR required IS NULL),
  label TEXT
);

CREATE TABLE IF NOT EXISTS field_defaults (
  fieldId INTEGER PRIMARY KEY,
  FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS string_field_defaults (
  fieldId INTEGER PRIMARY KEY,
  value TEXT NOT NULL,
  FOREIGN KEY (fieldId) REFERENCES field_defaults(fieldId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS number_field_defaults (
  fieldId INTEGER PRIMARY KEY,
  value TEXT NOT NULL,
  FOREIGN KEY (fieldId) REFERENCES field_defaults(fieldId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS boolean_field_defaults (
  fieldId INTEGER PRIMARY KEY,
  value INTEGER NOT NULL CHECK (value IN (0, 1)),
  FOREIGN KEY (fieldId) REFERENCES field_defaults(fieldId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS array_field_defaults (
  fieldId INTEGER PRIMARY KEY,
  FOREIGN KEY (fieldId) REFERENCES field_defaults(fieldId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS enum_variants (
  fieldId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (fieldId, position),
  FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS enum_field_defaults (
  fieldId INTEGER PRIMARY KEY,
  variantPosition INTEGER NOT NULL CHECK (variantPosition >= 0),
  FOREIGN KEY (fieldId) REFERENCES field_defaults(fieldId) ON DELETE CASCADE,
  FOREIGN KEY (fieldId, variantPosition) REFERENCES enum_variants(fieldId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS superposition (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS superposition_comments (
  id INTEGER PRIMARY KEY,
  superpositionId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  text TEXT NOT NULL,
  UNIQUE (superpositionId, position),
  FOREIGN KEY (superpositionId) REFERENCES superposition(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transitions (
  id INTEGER PRIMARY KEY,
  superpositionId INTEGER NOT NULL,
  targetSuperpositionId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (superpositionId, position),
  FOREIGN KEY (superpositionId) REFERENCES superposition(id) ON DELETE CASCADE,
  FOREIGN KEY (targetSuperpositionId) REFERENCES superposition(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conditions (
  transitionId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  fieldId INTEGER NOT NULL,
  nullValue INTEGER NOT NULL CHECK (nullValue IN (0, 1)),
  PRIMARY KEY (transitionId, position),
  FOREIGN KEY (transitionId) REFERENCES transitions(id) ON DELETE CASCADE,
  FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS processes (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
  name TEXT NOT NULL UNIQUE,
  builder TEXT NOT NULL CHECK (builder IN ('process', 'destroy')),
  gapBefore INTEGER NOT NULL CHECK (gapBefore >= 0),
  configMultiline INTEGER CHECK (configMultiline IN (0, 1) OR configMultiline IS NULL),
  label TEXT,
  labelPosition INTEGER CHECK (labelPosition >= 0 OR labelPosition IS NULL),
  desc TEXT,
  descPosition INTEGER CHECK (descPosition >= 0 OR descPosition IS NULL),
  envPosition INTEGER CHECK (envPosition >= 0 OR envPosition IS NULL),
  CHECK ((label IS NULL) = (labelPosition IS NULL)),
  CHECK ((desc IS NULL) = (descPosition IS NULL)),
  CHECK (labelPosition IS NULL OR descPosition IS NULL OR labelPosition <> descPosition),
  CHECK (labelPosition IS NULL OR envPosition IS NULL OR labelPosition <> envPosition),
  CHECK (descPosition IS NULL OR envPosition IS NULL OR descPosition <> envPosition)
);

CREATE TABLE IF NOT EXISTS process_envs (
  processId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  env TEXT NOT NULL CHECK (env IN ('browser', 'node', 'worker', 'server', 'any')),
  PRIMARY KEY (processId, position),
  FOREIGN KEY (processId) REFERENCES processes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_handlers (
  processId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  step TEXT NOT NULL CHECK (step IN ('action', 'success', 'error', 'before')),
  code TEXT NOT NULL,
  PRIMARY KEY (processId, position),
  UNIQUE (processId, step),
  FOREIGN KEY (processId) REFERENCES processes(id) ON DELETE CASCADE
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
