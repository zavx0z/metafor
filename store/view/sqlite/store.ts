import { Database, type SQLQueryBindings } from "bun:sqlite"
import { dbViewRequiredBackendIndexes, type DbViewBackend } from "../backend.t.ts"
import type {
  DbEntanglementFamilyRows,
  DbEntanglementFieldMemberRecord,
  DbEntanglementFieldRecord,
  DbEntanglementMemberRecord,
  DbEntanglementRecord,
  DbFieldSourceRecord,
  DbFieldValueRecord,
  DbWimpEdgeRecord,
  DbWimpFieldRecord,
  DbWimpRecord,
  DbWimpRows,
  DbWimpStateRecord,
} from "../types.t.ts"

export interface DbSqliteViewBackendOptions {
  filename?: string
  database?: Database
}

export interface DbSqliteViewBackend extends DbViewBackend {
  readonly database: Database
}

const isFileBackedSqlite = (filename: string | undefined): boolean => filename !== undefined && filename !== ":memory:"

const viewSchemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS view_wimps (
  id TEXT PRIMARY KEY,
  metaId TEXT NOT NULL,
  wimpOrder INTEGER NOT NULL,
  massOverrideJson TEXT
);

CREATE TABLE IF NOT EXISTS view_wimp_fields (
  id TEXT PRIMARY KEY,
  ownerWimpId TEXT NOT NULL,
  metaFieldId TEXT NOT NULL,
  fieldOrder INTEGER NOT NULL,
  FOREIGN KEY (ownerWimpId) REFERENCES view_wimps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS view_wimp_edges (
  id TEXT PRIMARY KEY,
  parentWimpId TEXT,
  childWimpId TEXT NOT NULL,
  edgeOrder INTEGER NOT NULL,
  FOREIGN KEY (parentWimpId) REFERENCES view_wimps(id) ON DELETE CASCADE,
  FOREIGN KEY (childWimpId) REFERENCES view_wimps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS view_field_values (
  id TEXT PRIMARY KEY,
  ownerWimpFieldId TEXT NOT NULL,
  valueJson TEXT NOT NULL,
  FOREIGN KEY (ownerWimpFieldId) REFERENCES view_wimp_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS view_field_sources (
  id TEXT PRIMARY KEY,
  childWimpFieldId TEXT NOT NULL,
  parentWimpFieldId TEXT NOT NULL,
  FOREIGN KEY (childWimpFieldId) REFERENCES view_wimp_fields(id) ON DELETE CASCADE,
  FOREIGN KEY (parentWimpFieldId) REFERENCES view_wimp_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS view_wimp_states (
  id TEXT PRIMARY KEY,
  ownerWimpId TEXT NOT NULL,
  metaStateId TEXT NOT NULL,
  FOREIGN KEY (ownerWimpId) REFERENCES view_wimps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS view_entanglements (
  id TEXT PRIMARY KEY,
  membershipKey TEXT NOT NULL,
  provenance TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS view_entanglement_members (
  id TEXT PRIMARY KEY,
  ownerEntanglementId TEXT NOT NULL,
  wimpId TEXT NOT NULL,
  memberOrder INTEGER NOT NULL,
  FOREIGN KEY (ownerEntanglementId) REFERENCES view_entanglements(id) ON DELETE CASCADE,
  FOREIGN KEY (wimpId) REFERENCES view_wimps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS view_entanglement_fields (
  id TEXT PRIMARY KEY,
  ownerEntanglementId TEXT NOT NULL,
  fieldOrder INTEGER NOT NULL,
  semanticKey TEXT NOT NULL,
  fieldName TEXT NOT NULL,
  provenance TEXT NOT NULL,
  representativeWimpFieldId TEXT NOT NULL,
  payloadIdsJson TEXT NOT NULL,
  semanticKeysJson TEXT NOT NULL,
  FOREIGN KEY (ownerEntanglementId) REFERENCES view_entanglements(id) ON DELETE CASCADE,
  FOREIGN KEY (representativeWimpFieldId) REFERENCES view_wimp_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS view_entanglement_field_members (
  id TEXT PRIMARY KEY,
  ownerEntanglementFieldId TEXT NOT NULL,
  ownerWimpId TEXT NOT NULL,
  wimpFieldId TEXT NOT NULL,
  memberOrder INTEGER NOT NULL,
  FOREIGN KEY (ownerEntanglementFieldId) REFERENCES view_entanglement_fields(id) ON DELETE CASCADE,
  FOREIGN KEY (ownerWimpId) REFERENCES view_wimps(id) ON DELETE CASCADE,
  FOREIGN KEY (wimpFieldId) REFERENCES view_wimp_fields(id) ON DELETE CASCADE
);
`

const serializeJson = (value: unknown): string => {
  const json = JSON.stringify(value)
  if (json === undefined) {
    throw new Error("DB SQLite view backend cannot persist undefined values")
  }
  return json
}

const parseJson = <T>(value: string | null): T | undefined => (value === null ? undefined : (JSON.parse(value) as T))

const compareById = <T extends { id: string }>(left: T, right: T): number => left.id.localeCompare(right.id)

const sortRowsById = <T extends { id: string }>(rows: T[]): T[] => rows.sort(compareById)

const viewTableResetOrder = [
  "view_entanglement_field_members",
  "view_entanglement_fields",
  "view_entanglement_members",
  "view_entanglements",
  "view_wimp_states",
  "view_field_sources",
  "view_field_values",
  "view_wimp_edges",
  "view_wimp_fields",
  "view_wimps",
] as const

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

const readWimpRecordRow = (row: Record<string, unknown>): DbWimpRecord => ({
  id: String(row.id),
  metaId: String(row.metaId),
  wimpOrder: Number(row.wimpOrder),
  ...(row.massOverrideJson !== null && row.massOverrideJson !== undefined
    ? { massOverride: parseJson(String(row.massOverrideJson)) }
    : {}),
})

const readWimpFieldRecordRow = (row: Record<string, unknown>): DbWimpFieldRecord => ({
  id: String(row.id),
  ownerWimpId: String(row.ownerWimpId),
  metaFieldId: String(row.metaFieldId),
  fieldOrder: Number(row.fieldOrder),
})

const readWimpEdgeRecordRow = (row: Record<string, unknown>): DbWimpEdgeRecord => ({
  id: String(row.id),
  parentWimpId: row.parentWimpId === null || row.parentWimpId === undefined ? null : String(row.parentWimpId),
  childWimpId: String(row.childWimpId),
  edgeOrder: Number(row.edgeOrder),
})

const readFieldValueRecordRow = (row: Record<string, unknown>): DbFieldValueRecord => ({
  id: String(row.id),
  ownerWimpFieldId: String(row.ownerWimpFieldId),
  value: parseJson(String(row.valueJson)),
})

const readFieldSourceRecordRow = (row: Record<string, unknown>): DbFieldSourceRecord => ({
  id: String(row.id),
  childWimpFieldId: String(row.childWimpFieldId),
  parentWimpFieldId: String(row.parentWimpFieldId),
})

const readWimpStateRecordRow = (row: Record<string, unknown>): DbWimpStateRecord => ({
  id: String(row.id),
  ownerWimpId: String(row.ownerWimpId),
  metaStateId: String(row.metaStateId),
})

const readEntanglementRecordRow = (row: Record<string, unknown>): DbEntanglementRecord => ({
  id: String(row.id),
  membershipKey: String(row.membershipKey),
  provenance: String(row.provenance),
})

const readEntanglementMemberRecordRow = (row: Record<string, unknown>): DbEntanglementMemberRecord => ({
  id: String(row.id),
  ownerEntanglementId: String(row.ownerEntanglementId),
  wimpId: String(row.wimpId),
  memberOrder: Number(row.memberOrder),
})

const readEntanglementFieldRecordRow = (row: Record<string, unknown>): DbEntanglementFieldRecord => ({
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

const readEntanglementFieldMemberRecordRow = (row: Record<string, unknown>): DbEntanglementFieldMemberRecord => ({
  id: String(row.id),
  ownerEntanglementFieldId: String(row.ownerEntanglementFieldId),
  ownerWimpId: String(row.ownerWimpId),
  wimpFieldId: String(row.wimpFieldId),
  memberOrder: Number(row.memberOrder),
})

export const initializeDbViewSqliteSchema = (database: Database): void => {
  database.exec(viewSchemaSql)

  dbViewRequiredBackendIndexes.forEach((index) => {
    const unique = index.unique ? "UNIQUE " : ""
    database.exec(`CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${index.columns.join(", ")})`)
  })
}

const resetViewTables = (database: Database): void => {
  database.transaction(() => {
    viewTableResetOrder.forEach((table) => {
      database.exec(`DELETE FROM ${table}`)
    })
  })()
}

const readWimpRowsFromDatabase = (database: Database, wimpId: string): DbWimpRows | null => {
  const wimp = queryRow(
    database,
    `SELECT id, metaId, wimpOrder, massOverrideJson
     FROM view_wimps
     WHERE id = ?`,
    [wimpId],
    readWimpRecordRow,
  )
  if (!wimp) return null

  const fields = queryRows(
    database,
    `SELECT id, ownerWimpId, metaFieldId, fieldOrder
     FROM view_wimp_fields
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
         FROM view_field_values
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
         FROM view_field_sources
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
     FROM view_wimp_states
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
     FROM view_wimps
     ORDER BY wimpOrder, id`,
    [],
    (row) => String((row as Record<string, unknown>).id),
  )

const readWimpFieldFromDatabase = (database: Database, wimpFieldId: string): DbWimpFieldRecord | null =>
  queryRow(
    database,
    `SELECT id, ownerWimpId, metaFieldId, fieldOrder
     FROM view_wimp_fields
     WHERE id = ?`,
    [wimpFieldId],
    readWimpFieldRecordRow,
  )

const readWimpEdgeFromDatabase = (database: Database, childWimpId: string): DbWimpEdgeRecord | null =>
  queryRow(
    database,
    `SELECT id, parentWimpId, childWimpId, edgeOrder
     FROM view_wimp_edges
     WHERE childWimpId = ?`,
    [childWimpId],
    readWimpEdgeRecordRow,
  )

const readFieldValueFromDatabase = (database: Database, wimpFieldId: string): DbFieldValueRecord | null =>
  queryRow(
    database,
    `SELECT id, ownerWimpFieldId, valueJson
     FROM view_field_values
     WHERE ownerWimpFieldId = ?`,
    [wimpFieldId],
    readFieldValueRecordRow,
  )

const readFieldSourceFromDatabase = (database: Database, childWimpFieldId: string): DbFieldSourceRecord | null =>
  queryRow(
    database,
    `SELECT id, childWimpFieldId, parentWimpFieldId
     FROM view_field_sources
     WHERE childWimpFieldId = ?`,
    [childWimpFieldId],
    readFieldSourceRecordRow,
  )

const readEntanglementFamilyFromDatabase = (
  database: Database,
  entanglementId: string,
): DbEntanglementFamilyRows | null => {
  const entanglement = queryRow(
    database,
    `SELECT id, membershipKey, provenance
     FROM view_entanglements
     WHERE id = ?`,
    [entanglementId],
    readEntanglementRecordRow,
  )
  if (!entanglement) return null

  const members = queryRows(
    database,
    `SELECT id, ownerEntanglementId, wimpId, memberOrder
     FROM view_entanglement_members
     WHERE ownerEntanglementId = ?
     ORDER BY id`,
    [entanglementId],
    readEntanglementMemberRecordRow,
  )
  const fields = queryRows(
    database,
    `SELECT id, ownerEntanglementId, fieldOrder, semanticKey, fieldName, provenance,
            representativeWimpFieldId, payloadIdsJson, semanticKeysJson
     FROM view_entanglement_fields
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
     FROM view_entanglement_field_members
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

const upsertWimpRow = (database: Database, rows: DbWimpRows): void => {
  database.transaction(() => {
    database
      .query(
        `INSERT INTO view_wimps(id, metaId, wimpOrder, massOverrideJson)
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

    database.query(`DELETE FROM view_wimp_states WHERE ownerWimpId = ?`).run(rows.wimp.id)
    database.query(`DELETE FROM view_wimp_fields WHERE ownerWimpId = ?`).run(rows.wimp.id)

    const insertWimpField = database.query(
      `INSERT INTO view_wimp_fields(id, ownerWimpId, metaFieldId, fieldOrder) VALUES (?, ?, ?, ?)`,
    )
    rows.fields.forEach((row) => insertWimpField.run(row.id, row.ownerWimpId, row.metaFieldId, row.fieldOrder))

    const insertFieldValue = database.query(
      `INSERT INTO view_field_values(id, ownerWimpFieldId, valueJson) VALUES (?, ?, ?)`,
    )
    rows.values.forEach((row) => insertFieldValue.run(row.id, row.ownerWimpFieldId, serializeJson(row.value)))

    const insertFieldSource = database.query(
      `INSERT INTO view_field_sources(id, childWimpFieldId, parentWimpFieldId) VALUES (?, ?, ?)`,
    )
    rows.sources.forEach((row) => insertFieldSource.run(row.id, row.childWimpFieldId, row.parentWimpFieldId))

    database
      .query(`INSERT INTO view_wimp_states(id, ownerWimpId, metaStateId) VALUES (?, ?, ?)`)
      .run(rows.state.id, rows.state.ownerWimpId, rows.state.metaStateId)
  })()
}

const writeWimpEdgeInDatabase = (database: Database, row: DbWimpEdgeRecord): void => {
  database
    .query(
      `INSERT INTO view_wimp_edges(id, parentWimpId, childWimpId, edgeOrder)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(childWimpId) DO UPDATE SET
         id = excluded.id,
         parentWimpId = excluded.parentWimpId,
         edgeOrder = excluded.edgeOrder`,
    )
    .run(row.id, row.parentWimpId, row.childWimpId, row.edgeOrder)
}

const deleteEntanglementFamilyInDatabase = (database: Database, entanglementId: string): void => {
  database.query(`DELETE FROM view_entanglements WHERE id = ?`).run(entanglementId)
}

const writeEntanglementFamilyInDatabase = (database: Database, rows: DbEntanglementFamilyRows): void => {
  database.transaction(() => {
    deleteEntanglementFamilyInDatabase(database, rows.entanglement.id)

    const insertEntanglement = database.query(
      `INSERT INTO view_entanglements(id, membershipKey, provenance) VALUES (?, ?, ?)`,
    )
    insertEntanglement.run(rows.entanglement.id, rows.entanglement.membershipKey, rows.entanglement.provenance)

    const insertEntanglementMember = database.query(
      `INSERT INTO view_entanglement_members(id, ownerEntanglementId, wimpId, memberOrder) VALUES (?, ?, ?, ?)`,
    )
    rows.members.forEach((row) =>
      insertEntanglementMember.run(row.id, row.ownerEntanglementId, row.wimpId, row.memberOrder),
    )

    const insertEntanglementField = database.query(
      `INSERT INTO view_entanglement_fields(
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
      `INSERT INTO view_entanglement_field_members(id, ownerEntanglementFieldId, ownerWimpId, wimpFieldId, memberOrder)
       VALUES (?, ?, ?, ?, ?)`,
    )
    rows.fieldMembers.forEach((row) =>
      insertEntanglementFieldMember.run(
        row.id,
        row.ownerEntanglementFieldId,
        row.ownerWimpId,
        row.wimpFieldId,
        row.memberOrder,
      ),
    )
  })()
}

const setFieldValueInDatabase = (database: Database, wimpFieldId: string, value: unknown): void => {
  const result = database
    .query(`UPDATE view_field_values SET valueJson = ? WHERE ownerWimpFieldId = ?`)
    .run(serializeJson(value), wimpFieldId)

  if (result.changes === 0) {
    throw new Error(`Field value not found for wimp field ${wimpFieldId}`)
  }
}

const setWimpStateInDatabase = (database: Database, wimpId: string, metaStateId: string): void => {
  const result = database
    .query(`UPDATE view_wimp_states SET metaStateId = ? WHERE ownerWimpId = ?`)
    .run(metaStateId, wimpId)

  if (result.changes === 0) {
    throw new Error(`Wimp state not found for wimp ${wimpId}`)
  }
}

export const createSqliteDbViewBackend = (options: DbSqliteViewBackendOptions = {}): DbSqliteViewBackend => {
  const ownsDatabase = options.database === undefined
  const filename = options.filename ?? ":memory:"
  const database = options.database ?? new Database(filename)
  const fileBacked = ownsDatabase ? isFileBackedSqlite(filename) : false

  if (ownsDatabase && fileBacked) {
    database.exec("PRAGMA journal_mode = WAL;")
    database.exec("PRAGMA synchronous = NORMAL;")
    database.exec("PRAGMA busy_timeout = 5000;")
  }

  initializeDbViewSqliteSchema(database)

  return {
    database,
    requiredIndexes: dbViewRequiredBackendIndexes,

    close() {
      if (ownsDatabase) {
        database.close()
      }
    },

    reset() {
      resetViewTables(database)
    },

    async flush() {
      if (!fileBacked) return
      database.exec("PRAGMA wal_checkpoint(PASSIVE);")
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
      setFieldValueInDatabase(database, wimpFieldId, value)
    },

    setWimpState(wimpId, metaStateId) {
      setWimpStateInDatabase(database, wimpId, metaStateId)
    },
  }
}
