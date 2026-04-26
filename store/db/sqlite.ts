import { Database, type SQLQueryBindings } from "bun:sqlite"
import { createSqliteDbViewBackend, initializeDbViewSqliteSchema } from "../view/sqlite/store.ts"
import { initializeMetaDslSchema } from "../meta/sqlite/sqlite.ts"
import { dbRequiredBackendIndexes } from "./backend.ts"
import type { DbBackend, DbMetaRows } from "./backend.t.ts"
import type {
  DbFieldSchemaRecord,
  DbMetaFieldRecord,
  DbMetaMatterEdgeRecord,
  DbMetaMatterNodeRecord,
  DbMetaProcessReadRecord,
  DbMetaProcessRecord,
  DbMetaProcessWriteRecord,
  DbMetaReactionReadRecord,
  DbMetaReactionRecord,
  DbMetaReactionStateRecord,
  DbMetaReactionWriteRecord,
  DbMetaRecord,
  DbMetaStateRecord,
  DbMetaTransitionConditionRecord,
  DbMetaTransitionRecord,
} from "./db.t.ts"

export interface DbSqliteBackendOptions {
  filename?: string
  /** Уже открытый Database. Если указан — backend не открывает и не закрывает его. */
  database?: Database
}

export interface DbSqliteBackend extends DbBackend {
  readonly database: Database
}

const isFileBackedSqlite = (filename: string | undefined): boolean => filename !== undefined && filename !== ":memory:"

const metaSchemaSql = `
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
  actionWrapperSrc TEXT,
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
`

const serializeJson = (value: unknown): string => {
  const json = JSON.stringify(value)
  if (json === undefined) {
    throw new Error("DB SQLite backend cannot persist undefined values")
  }
  return json
}

const parseJson = <T>(value: string | null): T | undefined => (value === null ? undefined : (JSON.parse(value) as T))

const compareById = <T extends { id: string }>(left: T, right: T): number => left.id.localeCompare(right.id)

const sortRowsById = <T extends { id: string }>(rows: T[]): T[] => rows.sort(compareById)

const metaTableResetOrder = [
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

const readFieldSchema = (row: Record<string, unknown>): DbFieldSchemaRecord => {
  const base: DbFieldSchemaRecord = {
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

const readMetaRecordRow = (row: Record<string, unknown>): DbMetaRecord => ({
  id: String(row.id),
  src: String(row.src),
  ...(row.name !== null && row.name !== undefined ? { name: String(row.name) } : {}),
  ...(row.bulkJson !== null && row.bulkJson !== undefined ? { bulk: parseJson(String(row.bulkJson)) } : {}),
  ...(row.massJson !== null && row.massJson !== undefined ? { mass: parseJson(String(row.massJson)) } : {}),
})

const readMetaFieldRecordRow = (row: Record<string, unknown>): DbMetaFieldRecord => ({
  id: String(row.id),
  ownerMetaId: String(row.ownerMetaId),
  fieldKey: String(row.fieldKey),
  fieldOrder: Number(row.fieldOrder),
  schema: readFieldSchema(row),
})

const readMetaStateRecordRow = (row: Record<string, unknown>): DbMetaStateRecord => ({
  id: String(row.id),
  ownerMetaId: String(row.ownerMetaId),
  stateName: String(row.stateName),
  stateOrder: Number(row.stateOrder),
  initial: Boolean(row.initial),
})

const readMetaTransitionRecordRow = (row: Record<string, unknown>): DbMetaTransitionRecord => ({
  id: String(row.id),
  ownerMetaStateId: String(row.ownerMetaStateId),
  targetMetaStateId:
    row.targetMetaStateId === null || row.targetMetaStateId === undefined ? null : String(row.targetMetaStateId),
  transitionOrder: Number(row.transitionOrder),
})

const readMetaTransitionConditionRecordRow = (row: Record<string, unknown>): DbMetaTransitionConditionRecord => ({
  id: String(row.id),
  ownerMetaTransitionId: String(row.ownerMetaTransitionId),
  metaFieldId: String(row.metaFieldId),
  conditionOrder: Number(row.conditionOrder),
  condition: parseJson(String(row.conditionJson)),
})

const readMetaProcessRecordRow = (row: Record<string, unknown>): DbMetaProcessRecord => ({
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
  ...(row.actionWrapperSrc !== null && row.actionWrapperSrc !== undefined
    ? { actionWrapperSrc: String(row.actionWrapperSrc) }
    : {}),
  ...(row.successSrc !== null && row.successSrc !== undefined ? { successSrc: String(row.successSrc) } : {}),
  ...(row.errorSrc !== null && row.errorSrc !== undefined ? { errorSrc: String(row.errorSrc) } : {}),
  ...(row.beforeSrc !== null && row.beforeSrc !== undefined ? { beforeSrc: String(row.beforeSrc) } : {}),
})

const readMetaProcessReadRecordRow = (row: Record<string, unknown>): DbMetaProcessReadRecord => ({
  id: String(row.id),
  ownerMetaProcessId: String(row.ownerMetaProcessId),
  metaFieldId: String(row.metaFieldId),
  phase: String(row.phase) as "action" | "success" | "error" | "before",
  readOrder: Number(row.readOrder),
})

const readMetaProcessWriteRecordRow = (row: Record<string, unknown>): DbMetaProcessWriteRecord => ({
  id: String(row.id),
  ownerMetaProcessId: String(row.ownerMetaProcessId),
  metaFieldId: String(row.metaFieldId),
  phase: String(row.phase) as "success" | "error",
  writeOrder: Number(row.writeOrder),
})

const readMetaReactionRecordRow = (row: Record<string, unknown>): DbMetaReactionRecord => ({
  id: String(row.id),
  ownerMetaId: String(row.ownerMetaId),
  reactionKey: String(row.reactionKey),
  reactionOrder: Number(row.reactionOrder),
  label: String(row.label),
  ...(row.desc !== null && row.desc !== undefined ? { desc: String(row.desc) } : {}),
  cond: String(row.cond),
  src: String(row.src),
})

const readMetaReactionStateRecordRow = (row: Record<string, unknown>): DbMetaReactionStateRecord => ({
  id: String(row.id),
  ownerMetaReactionId: String(row.ownerMetaReactionId),
  metaStateId: String(row.metaStateId),
  stateOrder: Number(row.stateOrder),
})

const readMetaReactionReadRecordRow = (row: Record<string, unknown>): DbMetaReactionReadRecord => ({
  id: String(row.id),
  ownerMetaReactionId: String(row.ownerMetaReactionId),
  metaFieldId: String(row.metaFieldId),
  readOrder: Number(row.readOrder),
})

const readMetaReactionWriteRecordRow = (row: Record<string, unknown>): DbMetaReactionWriteRecord => ({
  id: String(row.id),
  ownerMetaReactionId: String(row.ownerMetaReactionId),
  metaFieldId: String(row.metaFieldId),
  writeOrder: Number(row.writeOrder),
})

const readMetaMatterNodeRecordRow = (row: Record<string, unknown>): DbMetaMatterNodeRecord => ({
  id: String(row.id),
  ownerMetaId: String(row.ownerMetaId),
  nodeType: String(row.nodeType),
  nodeOrder: Number(row.nodeOrder),
  payload: parseJson<Record<string, unknown>>(String(row.payloadJson)) ?? {},
})

const readMetaMatterEdgeRecordRow = (row: Record<string, unknown>): DbMetaMatterEdgeRecord => ({
  id: String(row.id),
  ownerMetaId: String(row.ownerMetaId),
  parentNodeId: row.parentNodeId === null || row.parentNodeId === undefined ? null : String(row.parentNodeId),
  childNodeId: String(row.childNodeId),
  edgeOrder: Number(row.edgeOrder),
})

export const initializeDbSqliteSchema = (database: Database): void => {
  database.exec(metaSchemaSql)

  // Apply view-level DDL via the view subsystem so view-таблицы и индексы остаются единым контрактом.
  initializeDbViewSqliteSchema(database)

  // Apply DSL-relational meta-schema (33 tables from @store/meta/sqlite *.sql modules) on the same Database.
  // materialize.syncMetaBundle dual-write: canonical meta_* + DSL-relational; canonical-adapter reads back from DSL-relational.
  initializeMetaDslSchema(database)

  dbRequiredBackendIndexes.forEach((index) => {
    const unique = index.unique ? "UNIQUE " : ""
    database.exec(`CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${index.columns.join(", ")})`)
  })
}

const resetMetaTables = (database: Database): void => {
  database.transaction(() => {
    metaTableResetOrder.forEach((table) => {
      database.exec(`DELETE FROM ${table}`)
    })
  })()
}

const readMetaRowsFromDatabase = (database: Database, metaId: string): DbMetaRows | null => {
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
            actionSrc, actionImportSpecifier, actionWrapperSrc, successSrc, errorSrc, beforeSrc
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

const upsertMetaRow = (database: Database, rows: DbMetaRows): void => {
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
         actionSrc, actionImportSpecifier, actionWrapperSrc, successSrc, errorSrc, beforeSrc
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        row.actionWrapperSrc ?? null,
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

export const openDbSqliteBackend = (options: DbSqliteBackendOptions = {}): DbSqliteBackend => {
  const ownsDatabase = options.database === undefined
  const filename = options.filename ?? ":memory:"
  const database = options.database ?? new Database(filename)
  const fileBacked = options.database === undefined && isFileBackedSqlite(filename)

  if (fileBacked) {
    database.exec("PRAGMA journal_mode = WAL;")
    database.exec("PRAGMA synchronous = NORMAL;")
    database.exec("PRAGMA busy_timeout = 5000;")
  }

  // Полная schema (meta + view + ALL indexes) применяется через initializeDbSqliteSchema.
  // initializeDbViewSqliteSchema внутри неё создаёт view-DDL и view-индексы;
  // здесь же создаются meta-DDL и оставшиеся meta-индексы.
  initializeDbSqliteSchema(database)

  // ViewBackend разделяет тот же Database — не закрывает его, не управляет PRAGMA-ми (это делает unified backend).
  const viewBackend = createSqliteDbViewBackend({ database })

  return {
    database,
    requiredIndexes: dbRequiredBackendIndexes,

    close() {
      if (ownsDatabase) database.close()
    },

    reset() {
      // Сначала сбрасываем view-таблицы (FK ссылаются на meta_*), затем meta-таблицы.
      viewBackend.reset()
      resetMetaTables(database)
    },

    async flush() {
      if (!fileBacked) return
      database.exec("PRAGMA wal_checkpoint(PASSIVE);")
    },

    async readMetaRows(metaId) {
      return readMetaRowsFromDatabase(database, metaId)
    },

    listWimpIds() {
      return viewBackend.listWimpIds()
    },

    readWimpRows(wimpId) {
      return viewBackend.readWimpRows(wimpId)
    },

    readWimpField(wimpFieldId) {
      return viewBackend.readWimpField(wimpFieldId)
    },

    readWimpEdge(childWimpId) {
      return viewBackend.readWimpEdge(childWimpId)
    },

    readFieldValue(wimpFieldId) {
      return viewBackend.readFieldValue(wimpFieldId)
    },

    readFieldSource(childWimpFieldId) {
      return viewBackend.readFieldSource(childWimpFieldId)
    },

    readEntanglementFamily(entanglementId) {
      return viewBackend.readEntanglementFamily(entanglementId)
    },

    writeMetaRows(rows) {
      upsertMetaRow(database, rows)
    },

    writeWimpRows(rows) {
      return viewBackend.writeWimpRows(rows)
    },

    writeWimpEdge(row) {
      return viewBackend.writeWimpEdge(row)
    },

    deleteEntanglementFamily(entanglementId) {
      return viewBackend.deleteEntanglementFamily(entanglementId)
    },

    writeEntanglementFamily(rows) {
      return viewBackend.writeEntanglementFamily(rows)
    },

    setFieldValue(wimpFieldId, value) {
      return viewBackend.setFieldValue(wimpFieldId, value)
    },

    setWimpState(wimpId, metaStateId) {
      return viewBackend.setWimpState(wimpId, metaStateId)
    },
  }
}
