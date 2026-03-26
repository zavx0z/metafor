import type { Database } from "bun:sqlite"

export const sectionOrder = ["fields", "superposition", "mass", "processes", "reactions", "matter", "bulk"] as const

export type SectionName = (typeof sectionOrder)[number]

export type FieldType = "string" | "boolean" | "number" | "array" | "enum"

export type FieldPresence = "optional" | "required" | null

export type LiteralType = "string" | "number" | "boolean" | "array" | "null"

export type ProcessBuilder = "process" | "destroy"

export type ProcessEnv = "browser" | "node" | "worker" | "server" | "any"

export type ProcessStep = "action" | "success" | "error" | "before"

export interface MetaRow {
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
  presence: FieldPresence
  label: string | null
  defaultType: LiteralType | null
  defaultText: string | null
  defaultNumber: string | null
  defaultBoolean: boolean | null
}

export interface EnumVariantRow {
  fieldId: number
  position: number
  textValue: string | null
  numberValue: string | null
}

export interface StateRow {
  id: number
  position: number
  name: string
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
  configMultiline INTEGER,
  desc TEXT,
  descPosition INTEGER,
  dev INTEGER,
  devPosition INTEGER
);

CREATE TABLE IF NOT EXISTS sections (
  name TEXT PRIMARY KEY,
  params TEXT,
  code TEXT
);

CREATE TABLE IF NOT EXISTS fields (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  presence TEXT,
  label TEXT,
  defaultType TEXT,
  defaultText TEXT,
  defaultNumber TEXT,
  defaultBoolean INTEGER
);

CREATE TABLE IF NOT EXISTS enum_variants (
  fieldId INTEGER NOT NULL,
  position INTEGER NOT NULL,
  textValue TEXT,
  numberValue TEXT,
  PRIMARY KEY (fieldId, position),
  FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS states (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS transition_comments (
  id INTEGER PRIMARY KEY,
  stateId INTEGER NOT NULL,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  UNIQUE (stateId, position),
  FOREIGN KEY (stateId) REFERENCES states(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transitions (
  id INTEGER PRIMARY KEY,
  stateId INTEGER NOT NULL,
  targetStateId INTEGER NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE (stateId, position),
  FOREIGN KEY (stateId) REFERENCES states(id) ON DELETE CASCADE,
  FOREIGN KEY (targetStateId) REFERENCES states(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conditions (
  transitionId INTEGER NOT NULL,
  position INTEGER NOT NULL,
  fieldId INTEGER NOT NULL,
  nullValue INTEGER NOT NULL,
  PRIMARY KEY (transitionId, position),
  FOREIGN KEY (transitionId) REFERENCES transitions(id) ON DELETE CASCADE,
  FOREIGN KEY (fieldId) REFERENCES fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS processes (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  builder TEXT NOT NULL,
  gapBefore INTEGER NOT NULL,
  configMultiline INTEGER,
  label TEXT,
  labelPosition INTEGER,
  desc TEXT,
  descPosition INTEGER,
  envPosition INTEGER
);

CREATE TABLE IF NOT EXISTS process_envs (
  processId INTEGER NOT NULL,
  position INTEGER NOT NULL,
  env TEXT NOT NULL,
  PRIMARY KEY (processId, position),
  FOREIGN KEY (processId) REFERENCES processes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_handlers (
  processId INTEGER NOT NULL,
  position INTEGER NOT NULL,
  step TEXT NOT NULL,
  code TEXT NOT NULL,
  PRIMARY KEY (processId, step),
  UNIQUE (processId, position),
  FOREIGN KEY (processId) REFERENCES processes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE,
  code TEXT NOT NULL
);
`

export const ensureRoundTripSchema = (database: Database) => {
  database.exec(roundTripSchemaSql)
}
