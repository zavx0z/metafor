import type { Database } from "bun:sqlite"

export const dslSectionOrder = ["fields", "superposition", "mass", "processes", "reactions", "matter", "bulk"] as const

export type DslSectionName = (typeof dslSectionOrder)[number]

export type DslBodyKind =
  | "arrow-object"
  | "object"
  | "expression"
  | "arrow-array"
  | "optional-expression"

export interface DslModuleRow {
  moduleKey: string
  sourcePath: string | null
  metaName: string
  metaConfigSource: string | null
}

export interface DslSectionRow {
  moduleKey: string
  sectionName: DslSectionName
  sectionOrder: number
  bodyKind: DslBodyKind
  paramsSource: string | null
  argumentSource: string | null
}

export interface DslFieldRow {
  moduleKey: string
  fieldOrder: number
  fieldKey: string
  fieldSource: string
}

export interface DslStateRow {
  moduleKey: string
  stateOrder: number
  stateName: string
  stateSource: string
}

export interface DslProcessRow {
  moduleKey: string
  processOrder: number
  processKey: string
  processSource: string
}

export interface DslReactionRow {
  moduleKey: string
  reactionOrder: number
  reactionSource: string
}

export const dslRoundTripSchemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dsl_modules (
  moduleKey TEXT PRIMARY KEY,
  sourcePath TEXT,
  metaName TEXT NOT NULL,
  metaConfigSource TEXT
);

CREATE TABLE IF NOT EXISTS dsl_imports (
  moduleKey TEXT NOT NULL,
  importOrder INTEGER NOT NULL,
  importSource TEXT NOT NULL,
  PRIMARY KEY (moduleKey, importOrder),
  FOREIGN KEY (moduleKey) REFERENCES dsl_modules(moduleKey) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dsl_sections (
  moduleKey TEXT NOT NULL,
  sectionName TEXT NOT NULL,
  sectionOrder INTEGER NOT NULL,
  bodyKind TEXT NOT NULL,
  paramsSource TEXT,
  argumentSource TEXT,
  PRIMARY KEY (moduleKey, sectionName),
  FOREIGN KEY (moduleKey) REFERENCES dsl_modules(moduleKey) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dsl_fields (
  moduleKey TEXT NOT NULL,
  fieldOrder INTEGER NOT NULL,
  fieldKey TEXT NOT NULL,
  fieldSource TEXT NOT NULL,
  PRIMARY KEY (moduleKey, fieldOrder),
  FOREIGN KEY (moduleKey) REFERENCES dsl_modules(moduleKey) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dsl_states (
  moduleKey TEXT NOT NULL,
  stateOrder INTEGER NOT NULL,
  stateName TEXT NOT NULL,
  stateSource TEXT NOT NULL,
  PRIMARY KEY (moduleKey, stateOrder),
  FOREIGN KEY (moduleKey) REFERENCES dsl_modules(moduleKey) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dsl_processes (
  moduleKey TEXT NOT NULL,
  processOrder INTEGER NOT NULL,
  processKey TEXT NOT NULL,
  processSource TEXT NOT NULL,
  PRIMARY KEY (moduleKey, processOrder),
  FOREIGN KEY (moduleKey) REFERENCES dsl_modules(moduleKey) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dsl_reactions (
  moduleKey TEXT NOT NULL,
  reactionOrder INTEGER NOT NULL,
  reactionSource TEXT NOT NULL,
  PRIMARY KEY (moduleKey, reactionOrder),
  FOREIGN KEY (moduleKey) REFERENCES dsl_modules(moduleKey) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS dsl_fields_by_key ON dsl_fields (moduleKey, fieldKey);
CREATE INDEX IF NOT EXISTS dsl_states_by_name ON dsl_states (moduleKey, stateName);
CREATE INDEX IF NOT EXISTS dsl_processes_by_key ON dsl_processes (moduleKey, processKey);
`

export const ensureDslRoundTripSchema = (database: Database) => {
  database.exec(dslRoundTripSchemaSql)
}
