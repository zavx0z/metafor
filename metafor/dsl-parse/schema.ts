import type { Database } from "bun:sqlite"

export const dslSectionOrder = ["fields", "superposition", "mass", "processes", "reactions", "matter", "bulk"] as const

export type DslSectionName = (typeof dslSectionOrder)[number]

export type DslBodyKind =
  | "arrow-object"
  | "object"
  | "expression"
  | "arrow-array"
  | "optional-expression"

export type DslFieldKind = "string" | "boolean" | "number" | "enum"

export type DslFieldModifierKind = "optional" | "required" | null

export type DslStateEntryKind = "transition" | "comment"

export type DslProcessKind = "process" | "destroy"

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
  fieldKind: DslFieldKind
  enumValuesJson: string | null
  modifierKind: DslFieldModifierKind
  modifierArgSource: string | null
}

export interface DslStateRow {
  moduleKey: string
  stateOrder: number
  stateName: string
}

export interface DslStateEntryRow {
  moduleKey: string
  stateOrder: number
  entryOrder: number
  entryKind: DslStateEntryKind
  targetState: string | null
  conditionSource: string | null
  commentSource: string | null
}

export interface DslProcessRow {
  moduleKey: string
  processOrder: number
  processKey: string
  processKind: DslProcessKind
  gapBefore: number
  configSource: string | null
  actionSource: string | null
  successSource: string | null
  errorSource: string | null
  beforeSource: string | null
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
  fieldKind TEXT NOT NULL,
  enumValuesJson TEXT,
  modifierKind TEXT,
  modifierArgSource TEXT,
  PRIMARY KEY (moduleKey, fieldOrder),
  FOREIGN KEY (moduleKey) REFERENCES dsl_modules(moduleKey) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dsl_states (
  moduleKey TEXT NOT NULL,
  stateOrder INTEGER NOT NULL,
  stateName TEXT NOT NULL,
  PRIMARY KEY (moduleKey, stateOrder),
  FOREIGN KEY (moduleKey) REFERENCES dsl_modules(moduleKey) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dsl_state_entries (
  moduleKey TEXT NOT NULL,
  stateOrder INTEGER NOT NULL,
  entryOrder INTEGER NOT NULL,
  entryKind TEXT NOT NULL,
  targetState TEXT,
  conditionSource TEXT,
  commentSource TEXT,
  PRIMARY KEY (moduleKey, stateOrder, entryOrder),
  FOREIGN KEY (moduleKey, stateOrder) REFERENCES dsl_states(moduleKey, stateOrder) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dsl_processes (
  moduleKey TEXT NOT NULL,
  processOrder INTEGER NOT NULL,
  processKey TEXT NOT NULL,
  processKind TEXT NOT NULL,
  gapBefore INTEGER NOT NULL,
  configSource TEXT,
  actionSource TEXT,
  successSource TEXT,
  errorSource TEXT,
  beforeSource TEXT,
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
