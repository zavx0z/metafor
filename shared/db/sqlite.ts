import { Database, type SQLQueryBindings } from "bun:sqlite"
import { createEmptySharedDbData, normalizeSharedDbData, sharedDbRequiredBackendIndexes } from "./backend.ts"
import type { SharedDbBackend, SharedDbEntanglementFamilyRows, SharedDbMetaRows, SharedDbWimpRows } from "./backend.t.ts"
import type {
  SharedDbData,
  SharedDbEntanglementFieldMemberRecord,
  SharedDbEntanglementFieldRecord,
  SharedDbEntanglementMemberRecord,
  SharedDbEntanglementRecord,
  SharedDbFieldSchemaRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbMetaFieldRecord,
  SharedDbMetaMatterEdgeRecord,
  SharedDbMetaMatterNodeRecord,
  SharedDbMetaProcessReadRecord,
  SharedDbMetaProcessRecord,
  SharedDbMetaProcessWriteRecord,
  SharedDbMetaReactionReadRecord,
  SharedDbMetaReactionRecord,
  SharedDbMetaReactionStateRecord,
  SharedDbMetaReactionWriteRecord,
  SharedDbMetaRecord,
  SharedDbMetaStateRecord,
  SharedDbMetaTransitionConditionRecord,
  SharedDbMetaTransitionRecord,
  SharedDbWimpEdgeRecord,
  SharedDbWimpFieldRecord,
  SharedDbWimpRecord,
  SharedDbWimpStateRecord,
} from "./db.t.ts"

export interface SharedDbSqliteBackendOptions {
  filename?: string
}

const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS metas (
  id TEXT PRIMARY KEY,
  src TEXT NOT NULL,
  name TEXT,
  bulkJson TEXT,
  massJson TEXT
);

CREATE TABLE IF NOT EXISTS meta_fields (
  id TEXT PRIMARY KEY,
  ownerMetaId TEXT NOT NULL,
  fieldKey TEXT NOT NULL,
  fieldOrder INTEGER NOT NULL,
  schemaType TEXT NOT NULL,
  schemaRequired INTEGER NOT NULL,
  schemaTopology INTEGER NOT NULL,
  schemaLabel TEXT,
  schemaValues TEXT,
  FOREIGN KEY (ownerMetaId) REFERENCES metas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_states (
  id TEXT PRIMARY KEY,
  ownerMetaId TEXT NOT NULL,
  stateName TEXT NOT NULL,
  stateOrder INTEGER NOT NULL,
  initial INTEGER NOT NULL,
  FOREIGN KEY (ownerMetaId) REFERENCES metas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_transitions (
  id TEXT PRIMARY KEY,
  ownerMetaStateId TEXT NOT NULL,
  targetMetaStateId TEXT,
  transitionOrder INTEGER NOT NULL,
  FOREIGN KEY (ownerMetaStateId) REFERENCES meta_states(id) ON DELETE CASCADE,
  FOREIGN KEY (targetMetaStateId) REFERENCES meta_states(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_transition_conditions (
  id TEXT PRIMARY KEY,
  ownerMetaTransitionId TEXT NOT NULL,
  metaFieldId TEXT NOT NULL,
  conditionOrder INTEGER NOT NULL,
  conditionJson TEXT NOT NULL,
  FOREIGN KEY (ownerMetaTransitionId) REFERENCES meta_transitions(id) ON DELETE CASCADE,
  FOREIGN KEY (metaFieldId) REFERENCES meta_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_processes (
  id TEXT PRIMARY KEY,
  ownerMetaId TEXT NOT NULL,
  processKey TEXT NOT NULL,
  processOrder INTEGER NOT NULL,
  processKind TEXT NOT NULL,
  label TEXT,
  desc TEXT,
  actionSrc TEXT,
  actionImportSpecifier TEXT,
  successSrc TEXT,
  errorSrc TEXT,
  beforeSrc TEXT,
  FOREIGN KEY (ownerMetaId) REFERENCES metas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_process_reads (
  id TEXT PRIMARY KEY,
  ownerMetaProcessId TEXT NOT NULL,
  metaFieldId TEXT NOT NULL,
  phase TEXT NOT NULL,
  readOrder INTEGER NOT NULL,
  FOREIGN KEY (ownerMetaProcessId) REFERENCES meta_processes(id) ON DELETE CASCADE,
  FOREIGN KEY (metaFieldId) REFERENCES meta_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_process_writes (
  id TEXT PRIMARY KEY,
  ownerMetaProcessId TEXT NOT NULL,
  metaFieldId TEXT NOT NULL,
  phase TEXT NOT NULL,
  writeOrder INTEGER NOT NULL,
  FOREIGN KEY (ownerMetaProcessId) REFERENCES meta_processes(id) ON DELETE CASCADE,
  FOREIGN KEY (metaFieldId) REFERENCES meta_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_reactions (
  id TEXT PRIMARY KEY,
  ownerMetaId TEXT NOT NULL,
  reactionKey TEXT NOT NULL,
  reactionOrder INTEGER NOT NULL,
  label TEXT NOT NULL,
  desc TEXT,
  cond TEXT NOT NULL,
  src TEXT NOT NULL,
  FOREIGN KEY (ownerMetaId) REFERENCES metas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_reaction_states (
  id TEXT PRIMARY KEY,
  ownerMetaReactionId TEXT NOT NULL,
  metaStateId TEXT NOT NULL,
  stateOrder INTEGER NOT NULL,
  FOREIGN KEY (ownerMetaReactionId) REFERENCES meta_reactions(id) ON DELETE CASCADE,
  FOREIGN KEY (metaStateId) REFERENCES meta_states(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_reaction_reads (
  id TEXT PRIMARY KEY,
  ownerMetaReactionId TEXT NOT NULL,
  metaFieldId TEXT NOT NULL,
  readOrder INTEGER NOT NULL,
  FOREIGN KEY (ownerMetaReactionId) REFERENCES meta_reactions(id) ON DELETE CASCADE,
  FOREIGN KEY (metaFieldId) REFERENCES meta_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_reaction_writes (
  id TEXT PRIMARY KEY,
  ownerMetaReactionId TEXT NOT NULL,
  metaFieldId TEXT NOT NULL,
  writeOrder INTEGER NOT NULL,
  FOREIGN KEY (ownerMetaReactionId) REFERENCES meta_reactions(id) ON DELETE CASCADE,
  FOREIGN KEY (metaFieldId) REFERENCES meta_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_matter_nodes (
  id TEXT PRIMARY KEY,
  ownerMetaId TEXT NOT NULL,
  nodeType TEXT NOT NULL,
  nodeOrder INTEGER NOT NULL,
  payloadJson TEXT NOT NULL,
  FOREIGN KEY (ownerMetaId) REFERENCES metas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta_matter_edges (
  id TEXT PRIMARY KEY,
  ownerMetaId TEXT NOT NULL,
  parentNodeId TEXT,
  childNodeId TEXT NOT NULL,
  edgeOrder INTEGER NOT NULL,
  FOREIGN KEY (ownerMetaId) REFERENCES metas(id) ON DELETE CASCADE,
  FOREIGN KEY (parentNodeId) REFERENCES meta_matter_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (childNodeId) REFERENCES meta_matter_nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wimps (
  id TEXT PRIMARY KEY,
  metaId TEXT NOT NULL,
  wimpOrder INTEGER NOT NULL,
  massOverrideJson TEXT,
  FOREIGN KEY (metaId) REFERENCES metas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wimp_fields (
  id TEXT PRIMARY KEY,
  ownerWimpId TEXT NOT NULL,
  metaFieldId TEXT NOT NULL,
  fieldOrder INTEGER NOT NULL,
  FOREIGN KEY (ownerWimpId) REFERENCES wimps(id) ON DELETE CASCADE,
  FOREIGN KEY (metaFieldId) REFERENCES meta_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wimp_edges (
  id TEXT PRIMARY KEY,
  parentWimpId TEXT,
  childWimpId TEXT NOT NULL,
  edgeOrder INTEGER NOT NULL,
  FOREIGN KEY (parentWimpId) REFERENCES wimps(id) ON DELETE CASCADE,
  FOREIGN KEY (childWimpId) REFERENCES wimps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_values (
  id TEXT PRIMARY KEY,
  ownerWimpFieldId TEXT NOT NULL,
  valueJson TEXT NOT NULL,
  FOREIGN KEY (ownerWimpFieldId) REFERENCES wimp_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_sources (
  id TEXT PRIMARY KEY,
  childWimpFieldId TEXT NOT NULL,
  parentWimpFieldId TEXT NOT NULL,
  FOREIGN KEY (childWimpFieldId) REFERENCES wimp_fields(id) ON DELETE CASCADE,
  FOREIGN KEY (parentWimpFieldId) REFERENCES wimp_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wimp_states (
  id TEXT PRIMARY KEY,
  ownerWimpId TEXT NOT NULL,
  metaStateId TEXT NOT NULL,
  FOREIGN KEY (ownerWimpId) REFERENCES wimps(id) ON DELETE CASCADE,
  FOREIGN KEY (metaStateId) REFERENCES meta_states(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entanglements (
  id TEXT PRIMARY KEY,
  membershipKey TEXT NOT NULL,
  provenance TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entanglement_members (
  id TEXT PRIMARY KEY,
  ownerEntanglementId TEXT NOT NULL,
  wimpId TEXT NOT NULL,
  memberOrder INTEGER NOT NULL,
  FOREIGN KEY (ownerEntanglementId) REFERENCES entanglements(id) ON DELETE CASCADE,
  FOREIGN KEY (wimpId) REFERENCES wimps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entanglement_fields (
  id TEXT PRIMARY KEY,
  ownerEntanglementId TEXT NOT NULL,
  fieldOrder INTEGER NOT NULL,
  semanticKey TEXT NOT NULL,
  fieldName TEXT NOT NULL,
  provenance TEXT NOT NULL,
  representativeWimpFieldId TEXT NOT NULL,
  payloadIdsJson TEXT NOT NULL,
  semanticKeysJson TEXT NOT NULL,
  FOREIGN KEY (ownerEntanglementId) REFERENCES entanglements(id) ON DELETE CASCADE,
  FOREIGN KEY (representativeWimpFieldId) REFERENCES wimp_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entanglement_field_members (
  id TEXT PRIMARY KEY,
  ownerEntanglementFieldId TEXT NOT NULL,
  ownerWimpId TEXT NOT NULL,
  wimpFieldId TEXT NOT NULL,
  memberOrder INTEGER NOT NULL,
  FOREIGN KEY (ownerEntanglementFieldId) REFERENCES entanglement_fields(id) ON DELETE CASCADE,
  FOREIGN KEY (ownerWimpId) REFERENCES wimps(id) ON DELETE CASCADE,
  FOREIGN KEY (wimpFieldId) REFERENCES wimp_fields(id) ON DELETE CASCADE
);
`

const serializeJson = (value: unknown): string => {
  const json = JSON.stringify(value)
  if (json === undefined) {
    throw new Error("Shared DB SQLite backend cannot persist undefined values")
  }
  return json
}

const parseJson = <T>(value: string | null): T | undefined => (value === null ? undefined : (JSON.parse(value) as T))

const compareById = <T extends { id: string }>(left: T, right: T): number => left.id.localeCompare(right.id)

const sortRowsById = <T extends { id: string }>(rows: T[]): T[] => rows.sort(compareById)

const tableResetOrder = [
  "entanglement_field_members",
  "entanglement_fields",
  "entanglement_members",
  "entanglements",
  "wimp_states",
  "field_sources",
  "field_values",
  "wimp_edges",
  "wimp_fields",
  "wimps",
  "meta_matter_edges",
  "meta_matter_nodes",
  "meta_reaction_writes",
  "meta_reaction_reads",
  "meta_reaction_states",
  "meta_reactions",
  "meta_process_writes",
  "meta_process_reads",
  "meta_processes",
  "meta_transition_conditions",
  "meta_transitions",
  "meta_states",
  "meta_fields",
  "metas",
] as const

const readFieldSchema = (row: Record<string, unknown>): SharedDbFieldSchemaRecord => {
  const base: SharedDbFieldSchemaRecord = {
    type: String(row.schemaType),
    required: Boolean(row.schemaRequired),
    topology: Boolean(row.schemaTopology),
  }

  if (row.schemaLabel !== null && row.schemaLabel !== undefined) {
    base.label = String(row.schemaLabel)
  }

  const schemaValues = row.schemaValues !== null && row.schemaValues !== undefined
    ? parseJson<Array<string | number>>(String(row.schemaValues))
    : undefined

  if (schemaValues !== undefined) {
    base.values = schemaValues
  }

  return base
}

const queryRow = <T>(
  database: Database,
  sql: string,
  params: SQLQueryBindings[],
  mapRow: (row: Record<string, unknown>) => T,
): T | null => {
  const row = database.query(sql).get(...params) as Record<string, unknown> | null
  return row ? mapRow(row) : null
}

const queryRows = <T>(
  database: Database,
  sql: string,
  params: SQLQueryBindings[],
  mapRow: (row: Record<string, unknown>) => T,
): T[] => (database.query(sql).all(...params) as Array<Record<string, unknown>>).map(mapRow)

const readMetaRecordRow = (row: Record<string, unknown>): SharedDbMetaRecord => ({
  id: String(row.id),
  src: String(row.src),
  ...(row.name !== null && row.name !== undefined ? { name: String(row.name) } : {}),
  ...(row.bulkJson !== null && row.bulkJson !== undefined ? { bulk: parseJson(String(row.bulkJson)) } : {}),
  ...(row.massJson !== null && row.massJson !== undefined ? { mass: parseJson(String(row.massJson)) } : {}),
})

const readMetaFieldRecordRow = (row: Record<string, unknown>): SharedDbMetaFieldRecord => ({
  id: String(row.id),
  ownerMetaId: String(row.ownerMetaId),
  fieldKey: String(row.fieldKey),
  fieldOrder: Number(row.fieldOrder),
  schema: readFieldSchema(row),
})

const readMetaStateRecordRow = (row: Record<string, unknown>): SharedDbMetaStateRecord => ({
  id: String(row.id),
  ownerMetaId: String(row.ownerMetaId),
  stateName: String(row.stateName),
  stateOrder: Number(row.stateOrder),
  initial: Boolean(row.initial),
})

const readMetaTransitionRecordRow = (row: Record<string, unknown>): SharedDbMetaTransitionRecord => ({
  id: String(row.id),
  ownerMetaStateId: String(row.ownerMetaStateId),
  targetMetaStateId:
    row.targetMetaStateId === null || row.targetMetaStateId === undefined ? null : String(row.targetMetaStateId),
  transitionOrder: Number(row.transitionOrder),
})

const readMetaTransitionConditionRecordRow = (row: Record<string, unknown>): SharedDbMetaTransitionConditionRecord => ({
  id: String(row.id),
  ownerMetaTransitionId: String(row.ownerMetaTransitionId),
  metaFieldId: String(row.metaFieldId),
  conditionOrder: Number(row.conditionOrder),
  condition: parseJson(String(row.conditionJson)),
})

const readMetaProcessRecordRow = (row: Record<string, unknown>): SharedDbMetaProcessRecord => ({
  id: String(row.id),
  ownerMetaId: String(row.ownerMetaId),
  processKey: String(row.processKey),
  processOrder: Number(row.processOrder),
  processKind: row.processKind === "finally" ? "finally" : "action",
  ...(row.label !== null && row.label !== undefined ? { label: String(row.label) } : {}),
  ...(row.desc !== null && row.desc !== undefined ? { desc: String(row.desc) } : {}),
  ...(row.actionSrc !== null && row.actionSrc !== undefined ? { actionSrc: String(row.actionSrc) } : {}),
  ...(row.actionImportSpecifier !== null && row.actionImportSpecifier !== undefined
    ? { actionImportSpecifier: String(row.actionImportSpecifier) }
    : {}),
  ...(row.successSrc !== null && row.successSrc !== undefined ? { successSrc: String(row.successSrc) } : {}),
  ...(row.errorSrc !== null && row.errorSrc !== undefined ? { errorSrc: String(row.errorSrc) } : {}),
  ...(row.beforeSrc !== null && row.beforeSrc !== undefined ? { beforeSrc: String(row.beforeSrc) } : {}),
})

const readMetaProcessReadRecordRow = (row: Record<string, unknown>): SharedDbMetaProcessReadRecord => ({
  id: String(row.id),
  ownerMetaProcessId: String(row.ownerMetaProcessId),
  metaFieldId: String(row.metaFieldId),
  phase: String(row.phase) as "action" | "success" | "error" | "before",
  readOrder: Number(row.readOrder),
})

const readMetaProcessWriteRecordRow = (row: Record<string, unknown>): SharedDbMetaProcessWriteRecord => ({
  id: String(row.id),
  ownerMetaProcessId: String(row.ownerMetaProcessId),
  metaFieldId: String(row.metaFieldId),
  phase: String(row.phase) as "success" | "error",
  writeOrder: Number(row.writeOrder),
})

const readMetaReactionRecordRow = (row: Record<string, unknown>): SharedDbMetaReactionRecord => ({
  id: String(row.id),
  ownerMetaId: String(row.ownerMetaId),
  reactionKey: String(row.reactionKey),
  reactionOrder: Number(row.reactionOrder),
  label: String(row.label),
  ...(row.desc !== null && row.desc !== undefined ? { desc: String(row.desc) } : {}),
  cond: String(row.cond),
  src: String(row.src),
})

const readMetaReactionStateRecordRow = (row: Record<string, unknown>): SharedDbMetaReactionStateRecord => ({
  id: String(row.id),
  ownerMetaReactionId: String(row.ownerMetaReactionId),
  metaStateId: String(row.metaStateId),
  stateOrder: Number(row.stateOrder),
})

const readMetaReactionReadRecordRow = (row: Record<string, unknown>): SharedDbMetaReactionReadRecord => ({
  id: String(row.id),
  ownerMetaReactionId: String(row.ownerMetaReactionId),
  metaFieldId: String(row.metaFieldId),
  readOrder: Number(row.readOrder),
})

const readMetaReactionWriteRecordRow = (row: Record<string, unknown>): SharedDbMetaReactionWriteRecord => ({
  id: String(row.id),
  ownerMetaReactionId: String(row.ownerMetaReactionId),
  metaFieldId: String(row.metaFieldId),
  writeOrder: Number(row.writeOrder),
})

const readMetaMatterNodeRecordRow = (row: Record<string, unknown>): SharedDbMetaMatterNodeRecord => ({
  id: String(row.id),
  ownerMetaId: String(row.ownerMetaId),
  nodeType: String(row.nodeType),
  nodeOrder: Number(row.nodeOrder),
  payload: parseJson<Record<string, unknown>>(String(row.payloadJson)) ?? {},
})

const readMetaMatterEdgeRecordRow = (row: Record<string, unknown>): SharedDbMetaMatterEdgeRecord => ({
  id: String(row.id),
  ownerMetaId: String(row.ownerMetaId),
  parentNodeId: row.parentNodeId === null || row.parentNodeId === undefined ? null : String(row.parentNodeId),
  childNodeId: String(row.childNodeId),
  edgeOrder: Number(row.edgeOrder),
})

const readWimpRecordRow = (row: Record<string, unknown>): SharedDbWimpRecord => ({
  id: String(row.id),
  metaId: String(row.metaId),
  wimpOrder: Number(row.wimpOrder),
  ...(row.massOverrideJson !== null && row.massOverrideJson !== undefined
    ? { massOverride: parseJson(String(row.massOverrideJson)) }
    : {}),
})

const readWimpFieldRecordRow = (row: Record<string, unknown>): SharedDbWimpFieldRecord => ({
  id: String(row.id),
  ownerWimpId: String(row.ownerWimpId),
  metaFieldId: String(row.metaFieldId),
  fieldOrder: Number(row.fieldOrder),
})

const readWimpEdgeRecordRow = (row: Record<string, unknown>): SharedDbWimpEdgeRecord => ({
  id: String(row.id),
  parentWimpId: row.parentWimpId === null || row.parentWimpId === undefined ? null : String(row.parentWimpId),
  childWimpId: String(row.childWimpId),
  edgeOrder: Number(row.edgeOrder),
})

const readFieldValueRecordRow = (row: Record<string, unknown>): SharedDbFieldValueRecord => ({
  id: String(row.id),
  ownerWimpFieldId: String(row.ownerWimpFieldId),
  value: parseJson(String(row.valueJson)),
})

const readFieldSourceRecordRow = (row: Record<string, unknown>): SharedDbFieldSourceRecord => ({
  id: String(row.id),
  childWimpFieldId: String(row.childWimpFieldId),
  parentWimpFieldId: String(row.parentWimpFieldId),
})

const readWimpStateRecordRow = (row: Record<string, unknown>): SharedDbWimpStateRecord => ({
  id: String(row.id),
  ownerWimpId: String(row.ownerWimpId),
  metaStateId: String(row.metaStateId),
})

const readEntanglementRecordRow = (row: Record<string, unknown>): SharedDbEntanglementRecord => ({
  id: String(row.id),
  membershipKey: String(row.membershipKey),
  provenance: String(row.provenance),
})

const readEntanglementMemberRecordRow = (row: Record<string, unknown>): SharedDbEntanglementMemberRecord => ({
  id: String(row.id),
  ownerEntanglementId: String(row.ownerEntanglementId),
  wimpId: String(row.wimpId),
  memberOrder: Number(row.memberOrder),
})

const readEntanglementFieldRecordRow = (row: Record<string, unknown>): SharedDbEntanglementFieldRecord => ({
  id: String(row.id),
  ownerEntanglementId: String(row.ownerEntanglementId),
  fieldOrder: Number(row.fieldOrder),
  semanticKey: String(row.semanticKey),
  fieldName: String(row.fieldName),
  provenance: String(row.provenance),
  representativeWimpFieldId: String(row.representativeWimpFieldId),
  payloadIds: parseJson<string[]>(String(row.payloadIdsJson)) ?? [],
  semanticKeys: parseJson<string[]>(String(row.semanticKeysJson)) ?? [],
})

const readEntanglementFieldMemberRecordRow = (row: Record<string, unknown>): SharedDbEntanglementFieldMemberRecord => ({
  id: String(row.id),
  ownerEntanglementFieldId: String(row.ownerEntanglementFieldId),
  ownerWimpId: String(row.ownerWimpId),
  wimpFieldId: String(row.wimpFieldId),
  memberOrder: Number(row.memberOrder),
})

export const initializeSharedDbSqliteSchema = (database: Database): void => {
  database.exec(schemaSql)

  sharedDbRequiredBackendIndexes.forEach((index) => {
    const unique = index.unique ? "UNIQUE " : ""
    database.exec(`CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${index.columns.join(", ")})`)
  })
}

const resetDatabase = (database: Database): void => {
  database.transaction(() => {
    tableResetOrder.forEach((table) => {
      database.exec(`DELETE FROM ${table}`)
    })
  })()
}

const readAllData = (database: Database): SharedDbData => ({
  metas: (
    database.query(`SELECT id, src, name, bulkJson, massJson FROM metas ORDER BY id`).all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    src: String(row.src),
    ...(row.name !== null && row.name !== undefined ? { name: String(row.name) } : {}),
    ...(row.bulkJson !== null && row.bulkJson !== undefined ? { bulk: parseJson(String(row.bulkJson)) } : {}),
    ...(row.massJson !== null && row.massJson !== undefined ? { mass: parseJson(String(row.massJson)) } : {}),
  })),
  metaFields: (
    database
      .query(
        `SELECT id, ownerMetaId, fieldKey, fieldOrder, schemaType, schemaRequired, schemaTopology, schemaLabel, schemaValues
         FROM meta_fields
         ORDER BY id`,
      )
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerMetaId: String(row.ownerMetaId),
    fieldKey: String(row.fieldKey),
    fieldOrder: Number(row.fieldOrder),
    schema: readFieldSchema(row),
  })),
  metaStates: (
    database
      .query(`SELECT id, ownerMetaId, stateName, stateOrder, initial FROM meta_states ORDER BY id`)
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerMetaId: String(row.ownerMetaId),
    stateName: String(row.stateName),
    stateOrder: Number(row.stateOrder),
    initial: Boolean(row.initial),
  })),
  metaTransitions: (
    database
      .query(`SELECT id, ownerMetaStateId, targetMetaStateId, transitionOrder FROM meta_transitions ORDER BY id`)
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerMetaStateId: String(row.ownerMetaStateId),
    targetMetaStateId:
      row.targetMetaStateId === null || row.targetMetaStateId === undefined ? null : String(row.targetMetaStateId),
    transitionOrder: Number(row.transitionOrder),
  })),
  metaTransitionConditions: (
    database
      .query(
        `SELECT id, ownerMetaTransitionId, metaFieldId, conditionOrder, conditionJson
         FROM meta_transition_conditions
         ORDER BY id`,
      )
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerMetaTransitionId: String(row.ownerMetaTransitionId),
    metaFieldId: String(row.metaFieldId),
    conditionOrder: Number(row.conditionOrder),
    condition: parseJson(String(row.conditionJson)),
  })),
  metaProcesses: (
    database
      .query(
        `SELECT id, ownerMetaId, processKey, processOrder, processKind, label, desc,
                actionSrc, actionImportSpecifier, successSrc, errorSrc, beforeSrc
         FROM meta_processes
         ORDER BY id`,
      )
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerMetaId: String(row.ownerMetaId),
    processKey: String(row.processKey),
    processOrder: Number(row.processOrder),
    processKind: row.processKind === "finally" ? "finally" : "action",
    ...(row.label !== null && row.label !== undefined ? { label: String(row.label) } : {}),
    ...(row.desc !== null && row.desc !== undefined ? { desc: String(row.desc) } : {}),
    ...(row.actionSrc !== null && row.actionSrc !== undefined ? { actionSrc: String(row.actionSrc) } : {}),
    ...(row.actionImportSpecifier !== null && row.actionImportSpecifier !== undefined
      ? { actionImportSpecifier: String(row.actionImportSpecifier) }
      : {}),
    ...(row.successSrc !== null && row.successSrc !== undefined ? { successSrc: String(row.successSrc) } : {}),
    ...(row.errorSrc !== null && row.errorSrc !== undefined ? { errorSrc: String(row.errorSrc) } : {}),
    ...(row.beforeSrc !== null && row.beforeSrc !== undefined ? { beforeSrc: String(row.beforeSrc) } : {}),
  })),
  metaProcessReads: (
    database
      .query(`SELECT id, ownerMetaProcessId, metaFieldId, phase, readOrder FROM meta_process_reads ORDER BY id`)
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerMetaProcessId: String(row.ownerMetaProcessId),
    metaFieldId: String(row.metaFieldId),
    phase: String(row.phase) as "action" | "success" | "error" | "before",
    readOrder: Number(row.readOrder),
  })),
  metaProcessWrites: (
    database
      .query(`SELECT id, ownerMetaProcessId, metaFieldId, phase, writeOrder FROM meta_process_writes ORDER BY id`)
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerMetaProcessId: String(row.ownerMetaProcessId),
    metaFieldId: String(row.metaFieldId),
    phase: String(row.phase) as "success" | "error",
    writeOrder: Number(row.writeOrder),
  })),
  metaReactions: (
    database
      .query(
        `SELECT id, ownerMetaId, reactionKey, reactionOrder, label, desc, cond, src
         FROM meta_reactions
         ORDER BY id`,
      )
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerMetaId: String(row.ownerMetaId),
    reactionKey: String(row.reactionKey),
    reactionOrder: Number(row.reactionOrder),
    label: String(row.label),
    ...(row.desc !== null && row.desc !== undefined ? { desc: String(row.desc) } : {}),
    cond: String(row.cond),
    src: String(row.src),
  })),
  metaReactionStates: (
    database
      .query(`SELECT id, ownerMetaReactionId, metaStateId, stateOrder FROM meta_reaction_states ORDER BY id`)
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerMetaReactionId: String(row.ownerMetaReactionId),
    metaStateId: String(row.metaStateId),
    stateOrder: Number(row.stateOrder),
  })),
  metaReactionReads: (
    database
      .query(`SELECT id, ownerMetaReactionId, metaFieldId, readOrder FROM meta_reaction_reads ORDER BY id`)
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerMetaReactionId: String(row.ownerMetaReactionId),
    metaFieldId: String(row.metaFieldId),
    readOrder: Number(row.readOrder),
  })),
  metaReactionWrites: (
    database
      .query(`SELECT id, ownerMetaReactionId, metaFieldId, writeOrder FROM meta_reaction_writes ORDER BY id`)
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerMetaReactionId: String(row.ownerMetaReactionId),
    metaFieldId: String(row.metaFieldId),
    writeOrder: Number(row.writeOrder),
  })),
  metaMatterNodes: (
    database
      .query(`SELECT id, ownerMetaId, nodeType, nodeOrder, payloadJson FROM meta_matter_nodes ORDER BY id`)
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerMetaId: String(row.ownerMetaId),
    nodeType: String(row.nodeType),
    nodeOrder: Number(row.nodeOrder),
    payload: parseJson<Record<string, unknown>>(String(row.payloadJson)) ?? {},
  })),
  metaMatterEdges: (
    database
      .query(`SELECT id, ownerMetaId, parentNodeId, childNodeId, edgeOrder FROM meta_matter_edges ORDER BY id`)
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerMetaId: String(row.ownerMetaId),
    parentNodeId: row.parentNodeId === null || row.parentNodeId === undefined ? null : String(row.parentNodeId),
    childNodeId: String(row.childNodeId),
    edgeOrder: Number(row.edgeOrder),
  })),
  wimps: (
    database.query(`SELECT id, metaId, wimpOrder, massOverrideJson FROM wimps ORDER BY id`).all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    metaId: String(row.metaId),
    wimpOrder: Number(row.wimpOrder),
    ...(row.massOverrideJson !== null && row.massOverrideJson !== undefined
      ? { massOverride: parseJson(String(row.massOverrideJson)) }
      : {}),
  })),
  wimpFields: (
    database.query(`SELECT id, ownerWimpId, metaFieldId, fieldOrder FROM wimp_fields ORDER BY id`).all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerWimpId: String(row.ownerWimpId),
    metaFieldId: String(row.metaFieldId),
    fieldOrder: Number(row.fieldOrder),
  })),
  wimpEdges: (
    database.query(`SELECT id, parentWimpId, childWimpId, edgeOrder FROM wimp_edges ORDER BY id`).all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    parentWimpId: row.parentWimpId === null || row.parentWimpId === undefined ? null : String(row.parentWimpId),
    childWimpId: String(row.childWimpId),
    edgeOrder: Number(row.edgeOrder),
  })),
  fieldValues: (
    database.query(`SELECT id, ownerWimpFieldId, valueJson FROM field_values ORDER BY id`).all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerWimpFieldId: String(row.ownerWimpFieldId),
    value: parseJson(String(row.valueJson)),
  })),
  fieldSources: (
    database
      .query(`SELECT id, childWimpFieldId, parentWimpFieldId FROM field_sources ORDER BY id`)
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    childWimpFieldId: String(row.childWimpFieldId),
    parentWimpFieldId: String(row.parentWimpFieldId),
  })),
  wimpStates: (
    database.query(`SELECT id, ownerWimpId, metaStateId FROM wimp_states ORDER BY id`).all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerWimpId: String(row.ownerWimpId),
    metaStateId: String(row.metaStateId),
  })),
  entanglements: (
    database.query(`SELECT id, membershipKey, provenance FROM entanglements ORDER BY id`).all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    membershipKey: String(row.membershipKey),
    provenance: String(row.provenance),
  })),
  entanglementMembers: (
    database
      .query(`SELECT id, ownerEntanglementId, wimpId, memberOrder FROM entanglement_members ORDER BY id`)
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerEntanglementId: String(row.ownerEntanglementId),
    wimpId: String(row.wimpId),
    memberOrder: Number(row.memberOrder),
  })),
  entanglementFields: (
    database
      .query(
        `SELECT id, ownerEntanglementId, fieldOrder, semanticKey, fieldName, provenance,
                representativeWimpFieldId, payloadIdsJson, semanticKeysJson
         FROM entanglement_fields
         ORDER BY id`,
      )
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerEntanglementId: String(row.ownerEntanglementId),
    fieldOrder: Number(row.fieldOrder),
    semanticKey: String(row.semanticKey),
    fieldName: String(row.fieldName),
    provenance: String(row.provenance),
    representativeWimpFieldId: String(row.representativeWimpFieldId),
    payloadIds: parseJson<string[]>(String(row.payloadIdsJson)) ?? [],
    semanticKeys: parseJson<string[]>(String(row.semanticKeysJson)) ?? [],
  })),
  entanglementFieldMembers: (
    database
      .query(
        `SELECT id, ownerEntanglementFieldId, ownerWimpId, wimpFieldId, memberOrder
         FROM entanglement_field_members
         ORDER BY id`,
      )
      .all() as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    ownerEntanglementFieldId: String(row.ownerEntanglementFieldId),
    ownerWimpId: String(row.ownerWimpId),
    wimpFieldId: String(row.wimpFieldId),
    memberOrder: Number(row.memberOrder),
  })),
})

const readMetaRowsFromDatabase = (database: Database, metaId: string): SharedDbMetaRows | null => {
  const meta = queryRow(
    database,
    `SELECT id, src, name, bulkJson, massJson FROM metas WHERE id = ?`,
    [metaId],
    readMetaRecordRow,
  )
  if (!meta) return null

  const fields = queryRows(
    database,
    `SELECT id, ownerMetaId, fieldKey, fieldOrder, schemaType, schemaRequired, schemaTopology, schemaLabel, schemaValues
     FROM meta_fields
     WHERE ownerMetaId = ?
     ORDER BY id`,
    [metaId],
    readMetaFieldRecordRow,
  )
  const states = queryRows(
    database,
    `SELECT id, ownerMetaId, stateName, stateOrder, initial
     FROM meta_states
     WHERE ownerMetaId = ?
     ORDER BY id`,
    [metaId],
    readMetaStateRecordRow,
  )
  const transitions = sortRowsById(
    states.flatMap((state) =>
      queryRows(
        database,
        `SELECT id, ownerMetaStateId, targetMetaStateId, transitionOrder
         FROM meta_transitions
         WHERE ownerMetaStateId = ?
         ORDER BY id`,
        [state.id],
        readMetaTransitionRecordRow,
      ),
    ),
  )
  const transitionConditions = sortRowsById(
    transitions.flatMap((transition) =>
      queryRows(
        database,
        `SELECT id, ownerMetaTransitionId, metaFieldId, conditionOrder, conditionJson
         FROM meta_transition_conditions
         WHERE ownerMetaTransitionId = ?
         ORDER BY id`,
        [transition.id],
        readMetaTransitionConditionRecordRow,
      ),
    ),
  )
  const processes = queryRows(
    database,
    `SELECT id, ownerMetaId, processKey, processOrder, processKind, label, desc,
            actionSrc, actionImportSpecifier, successSrc, errorSrc, beforeSrc
     FROM meta_processes
     WHERE ownerMetaId = ?
     ORDER BY id`,
    [metaId],
    readMetaProcessRecordRow,
  )
  const processReads = sortRowsById(
    processes.flatMap((process) =>
      queryRows(
        database,
        `SELECT id, ownerMetaProcessId, metaFieldId, phase, readOrder
         FROM meta_process_reads
         WHERE ownerMetaProcessId = ?
         ORDER BY id`,
        [process.id],
        readMetaProcessReadRecordRow,
      ),
    ),
  )
  const processWrites = sortRowsById(
    processes.flatMap((process) =>
      queryRows(
        database,
        `SELECT id, ownerMetaProcessId, metaFieldId, phase, writeOrder
         FROM meta_process_writes
         WHERE ownerMetaProcessId = ?
         ORDER BY id`,
        [process.id],
        readMetaProcessWriteRecordRow,
      ),
    ),
  )
  const reactions = queryRows(
    database,
    `SELECT id, ownerMetaId, reactionKey, reactionOrder, label, desc, cond, src
     FROM meta_reactions
     WHERE ownerMetaId = ?
     ORDER BY id`,
    [metaId],
    readMetaReactionRecordRow,
  )
  const reactionStates = sortRowsById(
    reactions.flatMap((reaction) =>
      queryRows(
        database,
        `SELECT id, ownerMetaReactionId, metaStateId, stateOrder
         FROM meta_reaction_states
         WHERE ownerMetaReactionId = ?
         ORDER BY id`,
        [reaction.id],
        readMetaReactionStateRecordRow,
      ),
    ),
  )
  const reactionReads = sortRowsById(
    reactions.flatMap((reaction) =>
      queryRows(
        database,
        `SELECT id, ownerMetaReactionId, metaFieldId, readOrder
         FROM meta_reaction_reads
         WHERE ownerMetaReactionId = ?
         ORDER BY id`,
        [reaction.id],
        readMetaReactionReadRecordRow,
      ),
    ),
  )
  const reactionWrites = sortRowsById(
    reactions.flatMap((reaction) =>
      queryRows(
        database,
        `SELECT id, ownerMetaReactionId, metaFieldId, writeOrder
         FROM meta_reaction_writes
         WHERE ownerMetaReactionId = ?
         ORDER BY id`,
        [reaction.id],
        readMetaReactionWriteRecordRow,
      ),
    ),
  )
  const matterNodes = queryRows(
    database,
    `SELECT id, ownerMetaId, nodeType, nodeOrder, payloadJson
     FROM meta_matter_nodes
     WHERE ownerMetaId = ?
     ORDER BY id`,
    [metaId],
    readMetaMatterNodeRecordRow,
  )
  const matterEdges = queryRows(
    database,
    `SELECT id, ownerMetaId, parentNodeId, childNodeId, edgeOrder
     FROM meta_matter_edges
     WHERE ownerMetaId = ?
     ORDER BY id`,
    [metaId],
    readMetaMatterEdgeRecordRow,
  )

  return {
    meta,
    fields,
    states,
    transitions,
    transitionConditions,
    processes,
    processReads,
    processWrites,
    reactions,
    reactionStates,
    reactionReads,
    reactionWrites,
    matterNodes,
    matterEdges,
  }
}

const readWimpRowsFromDatabase = (database: Database, wimpId: string): SharedDbWimpRows | null => {
  const wimp = queryRow(
    database,
    `SELECT id, metaId, wimpOrder, massOverrideJson
     FROM wimps
     WHERE id = ?`,
    [wimpId],
    readWimpRecordRow,
  )
  if (!wimp) return null

  const fields = queryRows(
    database,
    `SELECT id, ownerWimpId, metaFieldId, fieldOrder
     FROM wimp_fields
     WHERE ownerWimpId = ?
     ORDER BY id`,
    [wimpId],
    readWimpFieldRecordRow,
  )
  const values = sortRowsById(
    fields.flatMap((field) =>
      queryRows(
        database,
        `SELECT id, ownerWimpFieldId, valueJson
         FROM field_values
         WHERE ownerWimpFieldId = ?
         ORDER BY id`,
        [field.id],
        readFieldValueRecordRow,
      ),
    ),
  )
  const sources = sortRowsById(
    fields.flatMap((field) =>
      queryRows(
        database,
        `SELECT id, childWimpFieldId, parentWimpFieldId
         FROM field_sources
         WHERE childWimpFieldId = ?
         ORDER BY id`,
        [field.id],
        readFieldSourceRecordRow,
      ),
    ),
  )
  const state = queryRow(
    database,
    `SELECT id, ownerWimpId, metaStateId
     FROM wimp_states
     WHERE ownerWimpId = ?`,
    [wimpId],
    readWimpStateRecordRow,
  )
  if (!state) {
    throw new Error(`Wimp ${wimpId} is missing wimp_state row`)
  }

  return {
    wimp,
    fields,
    values,
    sources,
    state,
  }
}

const listWimpIdsFromDatabase = (database: Database): string[] =>
  queryRows(
    database,
    `SELECT id
     FROM wimps
     ORDER BY wimpOrder, id`,
    [],
    (row) => String((row as Record<string, unknown>).id),
  )

const readWimpFieldFromDatabase = (database: Database, wimpFieldId: string): SharedDbWimpFieldRecord | null =>
  queryRow(
    database,
    `SELECT id, ownerWimpId, metaFieldId, fieldOrder
     FROM wimp_fields
     WHERE id = ?`,
    [wimpFieldId],
    readWimpFieldRecordRow,
  )

const readWimpEdgeFromDatabase = (database: Database, childWimpId: string): SharedDbWimpEdgeRecord | null =>
  queryRow(
    database,
    `SELECT id, parentWimpId, childWimpId, edgeOrder
     FROM wimp_edges
     WHERE childWimpId = ?`,
    [childWimpId],
    readWimpEdgeRecordRow,
  )

const readFieldValueFromDatabase = (database: Database, wimpFieldId: string): SharedDbFieldValueRecord | null =>
  queryRow(
    database,
    `SELECT id, ownerWimpFieldId, valueJson
     FROM field_values
     WHERE ownerWimpFieldId = ?`,
    [wimpFieldId],
    readFieldValueRecordRow,
  )

const readFieldSourceFromDatabase = (database: Database, childWimpFieldId: string): SharedDbFieldSourceRecord | null =>
  queryRow(
    database,
    `SELECT id, childWimpFieldId, parentWimpFieldId
     FROM field_sources
     WHERE childWimpFieldId = ?`,
    [childWimpFieldId],
    readFieldSourceRecordRow,
  )

const readEntanglementFamilyFromDatabase = (
  database: Database,
  entanglementId: string,
): SharedDbEntanglementFamilyRows | null => {
  const entanglement = queryRow(
    database,
    `SELECT id, membershipKey, provenance
     FROM entanglements
     WHERE id = ?`,
    [entanglementId],
    readEntanglementRecordRow,
  )
  if (!entanglement) return null

  const members = queryRows(
    database,
    `SELECT id, ownerEntanglementId, wimpId, memberOrder
     FROM entanglement_members
     WHERE ownerEntanglementId = ?
     ORDER BY id`,
    [entanglementId],
    readEntanglementMemberRecordRow,
  )
  const fields = queryRows(
    database,
    `SELECT id, ownerEntanglementId, fieldOrder, semanticKey, fieldName, provenance,
            representativeWimpFieldId, payloadIdsJson, semanticKeysJson
     FROM entanglement_fields
     WHERE ownerEntanglementId = ?
     ORDER BY id`,
    [entanglementId],
    readEntanglementFieldRecordRow,
  )
  const field = fields[0]
  if (!field) {
    throw new Error(`Entanglement ${entanglementId} is missing entanglement_field rows`)
  }

  const fieldMembers = queryRows(
    database,
    `SELECT id, ownerEntanglementFieldId, ownerWimpId, wimpFieldId, memberOrder
     FROM entanglement_field_members
     WHERE ownerEntanglementFieldId = ?
     ORDER BY id`,
    [field.id],
    readEntanglementFieldMemberRecordRow,
  )

  return {
    entanglement,
    members,
    field,
    fieldMembers,
  }
}

const upsertMetaRow = (database: Database, rows: SharedDbMetaRows): void => {
  database.transaction(() => {
    database
      .query(
        `INSERT INTO metas(id, src, name, bulkJson, massJson)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           src = excluded.src,
           name = excluded.name,
           bulkJson = excluded.bulkJson,
           massJson = excluded.massJson`,
      )
      .run(
        rows.meta.id,
        rows.meta.src,
        rows.meta.name ?? null,
        rows.meta.bulk === undefined ? null : serializeJson(rows.meta.bulk),
        rows.meta.mass === undefined ? null : serializeJson(rows.meta.mass),
      )

    database.query(`DELETE FROM meta_matter_edges WHERE ownerMetaId = ?`).run(rows.meta.id)
    database.query(`DELETE FROM meta_matter_nodes WHERE ownerMetaId = ?`).run(rows.meta.id)
    database
      .query(`DELETE FROM meta_reaction_states WHERE ownerMetaReactionId IN (SELECT id FROM meta_reactions WHERE ownerMetaId = ?)`)
      .run(rows.meta.id)
    database
      .query(`DELETE FROM meta_reaction_reads WHERE ownerMetaReactionId IN (SELECT id FROM meta_reactions WHERE ownerMetaId = ?)`)
      .run(rows.meta.id)
    database
      .query(`DELETE FROM meta_reaction_writes WHERE ownerMetaReactionId IN (SELECT id FROM meta_reactions WHERE ownerMetaId = ?)`)
      .run(rows.meta.id)
    database.query(`DELETE FROM meta_reactions WHERE ownerMetaId = ?`).run(rows.meta.id)
    database
      .query(`DELETE FROM meta_process_reads WHERE ownerMetaProcessId IN (SELECT id FROM meta_processes WHERE ownerMetaId = ?)`)
      .run(rows.meta.id)
    database
      .query(`DELETE FROM meta_process_writes WHERE ownerMetaProcessId IN (SELECT id FROM meta_processes WHERE ownerMetaId = ?)`)
      .run(rows.meta.id)
    database.query(`DELETE FROM meta_processes WHERE ownerMetaId = ?`).run(rows.meta.id)
    database
      .query(
        `DELETE FROM meta_transition_conditions
         WHERE ownerMetaTransitionId IN (
           SELECT meta_transitions.id
           FROM meta_transitions
           INNER JOIN meta_states ON meta_states.id = meta_transitions.ownerMetaStateId
           WHERE meta_states.ownerMetaId = ?
         )`,
      )
      .run(rows.meta.id)
    database
      .query(`DELETE FROM meta_transitions WHERE ownerMetaStateId IN (SELECT id FROM meta_states WHERE ownerMetaId = ?)`)
      .run(rows.meta.id)
    database.query(`DELETE FROM meta_states WHERE ownerMetaId = ?`).run(rows.meta.id)
    database.query(`DELETE FROM meta_fields WHERE ownerMetaId = ?`).run(rows.meta.id)

    const insertMetaField = database.query(
      `INSERT INTO meta_fields(id, ownerMetaId, fieldKey, fieldOrder, schemaType, schemaRequired, schemaTopology, schemaLabel, schemaValues)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    rows.fields.forEach((row) => {
      insertMetaField.run(
        row.id,
        row.ownerMetaId,
        row.fieldKey,
        row.fieldOrder,
        row.schema.type,
        row.schema.required ? 1 : 0,
        row.schema.topology ? 1 : 0,
        row.schema.label ?? null,
        row.schema.values === undefined ? null : serializeJson(row.schema.values),
      )
    })

    const insertMetaState = database.query(
      `INSERT INTO meta_states(id, ownerMetaId, stateName, stateOrder, initial) VALUES (?, ?, ?, ?, ?)`,
    )
    rows.states.forEach((row) => insertMetaState.run(row.id, row.ownerMetaId, row.stateName, row.stateOrder, row.initial ? 1 : 0))

    const insertMetaTransition = database.query(
      `INSERT INTO meta_transitions(id, ownerMetaStateId, targetMetaStateId, transitionOrder) VALUES (?, ?, ?, ?)`,
    )
    rows.transitions.forEach((row) =>
      insertMetaTransition.run(row.id, row.ownerMetaStateId, row.targetMetaStateId, row.transitionOrder),
    )

    const insertMetaTransitionCondition = database.query(
      `INSERT INTO meta_transition_conditions(id, ownerMetaTransitionId, metaFieldId, conditionOrder, conditionJson)
       VALUES (?, ?, ?, ?, ?)`,
    )
    rows.transitionConditions.forEach((row) =>
      insertMetaTransitionCondition.run(
        row.id,
        row.ownerMetaTransitionId,
        row.metaFieldId,
        row.conditionOrder,
        serializeJson(row.condition),
      ),
    )

    const insertMetaProcess = database.query(
      `INSERT INTO meta_processes(
         id, ownerMetaId, processKey, processOrder, processKind, label, desc,
         actionSrc, actionImportSpecifier, successSrc, errorSrc, beforeSrc
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    rows.processes.forEach((row) =>
      insertMetaProcess.run(
        row.id,
        row.ownerMetaId,
        row.processKey,
        row.processOrder,
        row.processKind,
        row.label ?? null,
        row.desc ?? null,
        row.actionSrc ?? null,
        row.actionImportSpecifier ?? null,
        row.successSrc ?? null,
        row.errorSrc ?? null,
        row.beforeSrc ?? null,
      ),
    )

    const insertMetaProcessRead = database.query(
      `INSERT INTO meta_process_reads(id, ownerMetaProcessId, metaFieldId, phase, readOrder) VALUES (?, ?, ?, ?, ?)`,
    )
    rows.processReads.forEach((row) =>
      insertMetaProcessRead.run(row.id, row.ownerMetaProcessId, row.metaFieldId, row.phase, row.readOrder),
    )

    const insertMetaProcessWrite = database.query(
      `INSERT INTO meta_process_writes(id, ownerMetaProcessId, metaFieldId, phase, writeOrder) VALUES (?, ?, ?, ?, ?)`,
    )
    rows.processWrites.forEach((row) =>
      insertMetaProcessWrite.run(row.id, row.ownerMetaProcessId, row.metaFieldId, row.phase, row.writeOrder),
    )

    const insertMetaReaction = database.query(
      `INSERT INTO meta_reactions(id, ownerMetaId, reactionKey, reactionOrder, label, desc, cond, src)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    rows.reactions.forEach((row) =>
      insertMetaReaction.run(
        row.id,
        row.ownerMetaId,
        row.reactionKey,
        row.reactionOrder,
        row.label,
        row.desc ?? null,
        row.cond,
        row.src,
      ),
    )

    const insertMetaReactionState = database.query(
      `INSERT INTO meta_reaction_states(id, ownerMetaReactionId, metaStateId, stateOrder) VALUES (?, ?, ?, ?)`,
    )
    rows.reactionStates.forEach((row) =>
      insertMetaReactionState.run(row.id, row.ownerMetaReactionId, row.metaStateId, row.stateOrder),
    )

    const insertMetaReactionRead = database.query(
      `INSERT INTO meta_reaction_reads(id, ownerMetaReactionId, metaFieldId, readOrder) VALUES (?, ?, ?, ?)`,
    )
    rows.reactionReads.forEach((row) =>
      insertMetaReactionRead.run(row.id, row.ownerMetaReactionId, row.metaFieldId, row.readOrder),
    )

    const insertMetaReactionWrite = database.query(
      `INSERT INTO meta_reaction_writes(id, ownerMetaReactionId, metaFieldId, writeOrder) VALUES (?, ?, ?, ?)`,
    )
    rows.reactionWrites.forEach((row) =>
      insertMetaReactionWrite.run(row.id, row.ownerMetaReactionId, row.metaFieldId, row.writeOrder),
    )

    const insertMetaMatterNode = database.query(
      `INSERT INTO meta_matter_nodes(id, ownerMetaId, nodeType, nodeOrder, payloadJson) VALUES (?, ?, ?, ?, ?)`,
    )
    rows.matterNodes.forEach((row) =>
      insertMetaMatterNode.run(row.id, row.ownerMetaId, row.nodeType, row.nodeOrder, serializeJson(row.payload)),
    )

    const insertMetaMatterEdge = database.query(
      `INSERT INTO meta_matter_edges(id, ownerMetaId, parentNodeId, childNodeId, edgeOrder) VALUES (?, ?, ?, ?, ?)`,
    )
    rows.matterEdges.forEach((row) =>
      insertMetaMatterEdge.run(row.id, row.ownerMetaId, row.parentNodeId, row.childNodeId, row.edgeOrder),
    )
  })()
}

const upsertWimpRow = (database: Database, rows: SharedDbWimpRows): void => {
  database.transaction(() => {
    database
      .query(
        `INSERT INTO wimps(id, metaId, wimpOrder, massOverrideJson)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           metaId = excluded.metaId,
           wimpOrder = excluded.wimpOrder,
           massOverrideJson = excluded.massOverrideJson`,
      )
      .run(
        rows.wimp.id,
        rows.wimp.metaId,
        rows.wimp.wimpOrder,
        rows.wimp.massOverride === undefined ? null : serializeJson(rows.wimp.massOverride),
      )

    database.query(`DELETE FROM wimp_states WHERE ownerWimpId = ?`).run(rows.wimp.id)
    database.query(`DELETE FROM wimp_fields WHERE ownerWimpId = ?`).run(rows.wimp.id)

    const insertWimpField = database.query(
      `INSERT INTO wimp_fields(id, ownerWimpId, metaFieldId, fieldOrder) VALUES (?, ?, ?, ?)`,
    )
    rows.fields.forEach((row) => insertWimpField.run(row.id, row.ownerWimpId, row.metaFieldId, row.fieldOrder))

    const insertFieldValue = database.query(
      `INSERT INTO field_values(id, ownerWimpFieldId, valueJson) VALUES (?, ?, ?)`,
    )
    rows.values.forEach((row) => insertFieldValue.run(row.id, row.ownerWimpFieldId, serializeJson(row.value)))

    const insertFieldSource = database.query(
      `INSERT INTO field_sources(id, childWimpFieldId, parentWimpFieldId) VALUES (?, ?, ?)`,
    )
    rows.sources.forEach((row) => insertFieldSource.run(row.id, row.childWimpFieldId, row.parentWimpFieldId))

    database
      .query(`INSERT INTO wimp_states(id, ownerWimpId, metaStateId) VALUES (?, ?, ?)`)
      .run(rows.state.id, rows.state.ownerWimpId, rows.state.metaStateId)
  })()
}

const writeWimpEdgeInDatabase = (database: Database, row: SharedDbData["wimpEdges"][number]): void => {
  database
    .query(
      `INSERT INTO wimp_edges(id, parentWimpId, childWimpId, edgeOrder)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(childWimpId) DO UPDATE SET
         id = excluded.id,
         parentWimpId = excluded.parentWimpId,
         edgeOrder = excluded.edgeOrder`,
    )
    .run(row.id, row.parentWimpId, row.childWimpId, row.edgeOrder)
}

const deleteEntanglementFamilyInDatabase = (database: Database, entanglementId: string): void => {
  database.query(`DELETE FROM entanglements WHERE id = ?`).run(entanglementId)
}

const writeEntanglementFamilyInDatabase = (database: Database, rows: SharedDbEntanglementFamilyRows): void => {
  database.transaction(() => {
    deleteEntanglementFamilyInDatabase(database, rows.entanglement.id)

    const insertEntanglement = database.query(
      `INSERT INTO entanglements(id, membershipKey, provenance) VALUES (?, ?, ?)`,
    )
    insertEntanglement.run(rows.entanglement.id, rows.entanglement.membershipKey, rows.entanglement.provenance)

    const insertEntanglementMember = database.query(
      `INSERT INTO entanglement_members(id, ownerEntanglementId, wimpId, memberOrder) VALUES (?, ?, ?, ?)`,
    )
    rows.members.forEach((row) => insertEntanglementMember.run(row.id, row.ownerEntanglementId, row.wimpId, row.memberOrder))

    const insertEntanglementField = database.query(
      `INSERT INTO entanglement_fields(
         id, ownerEntanglementId, fieldOrder, semanticKey, fieldName, provenance,
         representativeWimpFieldId, payloadIdsJson, semanticKeysJson
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    insertEntanglementField.run(
      rows.field.id,
      rows.field.ownerEntanglementId,
      rows.field.fieldOrder,
      rows.field.semanticKey,
      rows.field.fieldName,
      rows.field.provenance,
      rows.field.representativeWimpFieldId,
      serializeJson(rows.field.payloadIds),
      serializeJson(rows.field.semanticKeys),
    )

    const insertEntanglementFieldMember = database.query(
      `INSERT INTO entanglement_field_members(id, ownerEntanglementFieldId, ownerWimpId, wimpFieldId, memberOrder)
       VALUES (?, ?, ?, ?, ?)`,
    )
    rows.fieldMembers.forEach((row) => insertEntanglementFieldMember.run(row.id, row.ownerEntanglementFieldId, row.ownerWimpId, row.wimpFieldId, row.memberOrder))
  })()
}

export const openSharedDbSqliteBackend = (options: SharedDbSqliteBackendOptions = {}): SharedDbBackend => {
  const database = new Database(options.filename ?? ":memory:")
  initializeSharedDbSqliteSchema(database)

  return {
    requiredIndexes: sharedDbRequiredBackendIndexes,

    close() {
      database.close()
    },

    reset() {
      resetDatabase(database)
    },

    async flush() {},

    readData() {
      return normalizeSharedDbData(readAllData(database))
    },

    async readMetaRows(metaId) {
      return readMetaRowsFromDatabase(database, metaId)
    },

    async listWimpIds() {
      return listWimpIdsFromDatabase(database)
    },

    async readWimpRows(wimpId) {
      return readWimpRowsFromDatabase(database, wimpId)
    },

    async readWimpField(wimpFieldId) {
      return readWimpFieldFromDatabase(database, wimpFieldId)
    },

    async readWimpEdge(childWimpId) {
      return readWimpEdgeFromDatabase(database, childWimpId)
    },

    async readFieldValue(wimpFieldId) {
      return readFieldValueFromDatabase(database, wimpFieldId)
    },

    async readFieldSource(childWimpFieldId) {
      return readFieldSourceFromDatabase(database, childWimpFieldId)
    },

    async readEntanglementFamily(entanglementId) {
      return readEntanglementFamilyFromDatabase(database, entanglementId)
    },

    writeMetaRows(rows) {
      upsertMetaRow(database, rows)
    },

    writeWimpRows(rows) {
      upsertWimpRow(database, rows)
    },

    writeWimpEdge(row) {
      writeWimpEdgeInDatabase(database, row)
    },

    deleteEntanglementFamily(entanglementId) {
      deleteEntanglementFamilyInDatabase(database, entanglementId)
    },

    writeEntanglementFamily(rows) {
      writeEntanglementFamilyInDatabase(database, rows)
    },

    setFieldValue(wimpFieldId, value) {
      const result = database
        .query(`UPDATE field_values SET valueJson = ? WHERE ownerWimpFieldId = ?`)
        .run(serializeJson(value), wimpFieldId)

      if (result.changes === 0) {
        throw new Error(`Field value not found for wimp field ${wimpFieldId}`)
      }
    },

    setWimpState(wimpId, metaStateId) {
      const result = database.query(`UPDATE wimp_states SET metaStateId = ? WHERE ownerWimpId = ?`).run(metaStateId, wimpId)

      if (result.changes === 0) {
        throw new Error(`Wimp state not found for wimp ${wimpId}`)
      }
    },
  }
}
