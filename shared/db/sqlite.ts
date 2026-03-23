import { Database } from "bun:sqlite"
import {
  createEmptySharedDbTabularSnapshot,
  normalizeSharedDbTabularData,
  prepareSharedDbTabularData,
  sharedDbRequiredBackendIndexes,
} from "./backend.ts"
import type { SharedDbBackend } from "./backend.t.ts"
import type {
  SharedDbBraneRecord,
  SharedDbFieldRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbProjection,
  SharedDbTabularData,
} from "./db.t.ts"

/** Опции открытия SQLite backend для shared/db. */
export interface SharedDbSqliteBackendOptions {
  /** Путь к SQLite-файлу. По умолчанию используется `:memory:`. */
  filename?: string
}

const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shared_db_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  rootBraneIndex INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS branes (
  "index" INTEGER PRIMARY KEY,
  darkWimpId TEXT NOT NULL,
  src TEXT NOT NULL,
  name TEXT,
  fieldOffset INTEGER NOT NULL,
  fieldCount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fields (
  "index" INTEGER PRIMARY KEY,
  darkFieldId TEXT NOT NULL,
  ownerBraneIndex INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  schemaType TEXT NOT NULL,
  schemaRequired INTEGER NOT NULL,
  schemaTopology INTEGER NOT NULL,
  schemaLabel TEXT,
  schemaValues TEXT,
  FOREIGN KEY (ownerBraneIndex) REFERENCES branes("index") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_values (
  fieldIndex INTEGER PRIMARY KEY,
  valueJson TEXT NOT NULL,
  FOREIGN KEY (fieldIndex) REFERENCES fields("index") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_sources (
  childFieldIndex INTEGER PRIMARY KEY,
  parentFieldIndex INTEGER NOT NULL,
  FOREIGN KEY (childFieldIndex) REFERENCES fields("index") ON DELETE CASCADE,
  FOREIGN KEY (parentFieldIndex) REFERENCES fields("index") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS branes_by_dark_wimp_id
  ON branes(darkWimpId);

CREATE UNIQUE INDEX IF NOT EXISTS fields_by_dark_field_id
  ON fields(darkFieldId);

CREATE UNIQUE INDEX IF NOT EXISTS fields_by_owner_brane_and_key
  ON fields(ownerBraneIndex, "key");

CREATE UNIQUE INDEX IF NOT EXISTS field_values_by_field_index
  ON field_values(fieldIndex);

CREATE UNIQUE INDEX IF NOT EXISTS field_sources_by_child_field_index
  ON field_sources(childFieldIndex);

CREATE INDEX IF NOT EXISTS field_sources_by_parent_field_index
  ON field_sources(parentFieldIndex);
`

const braneSelectSql = `
SELECT
  "index",
  darkWimpId,
  src,
  name,
  fieldOffset,
  fieldCount
FROM branes
`

const fieldSelectSql = `
SELECT
  "index",
  darkFieldId,
  ownerBraneIndex,
  "key",
  schemaType,
  schemaRequired,
  schemaTopology,
  schemaLabel,
  schemaValues
FROM fields
`

const fieldValueSelectSql = `
SELECT
  fieldIndex,
  valueJson
FROM field_values
`

const fieldSourceSelectSql = `
SELECT
  childFieldIndex,
  parentFieldIndex
FROM field_sources
`

const serializeJson = (value: unknown): string => {
  const json = JSON.stringify(value)
  if (json === undefined) {
    throw new Error("Shared DB SQLite backend cannot store undefined values")
  }
  return json
}

const parseJson = <T>(json: string): T => JSON.parse(json) as T

const mapBraneRow = (row: Record<string, unknown> | null): SharedDbBraneRecord | undefined => {
  if (!row) return undefined
  return {
    index: Number(row.index),
    darkWimpId: String(row.darkWimpId),
    src: String(row.src),
    ...(row.name !== null && row.name !== undefined ? { name: String(row.name) } : {}),
    fieldOffset: Number(row.fieldOffset),
    fieldCount: Number(row.fieldCount),
  }
}

const mapFieldRow = (row: Record<string, unknown> | null): SharedDbFieldRecord | undefined => {
  if (!row) return undefined
  return {
    index: Number(row.index),
    darkFieldId: String(row.darkFieldId),
    ownerBraneIndex: Number(row.ownerBraneIndex),
    key: String(row.key),
    schema: {
      type: String(row.schemaType),
      required: Boolean(row.schemaRequired),
      topology: Boolean(row.schemaTopology),
      ...(row.schemaLabel !== null && row.schemaLabel !== undefined ? { label: String(row.schemaLabel) } : {}),
      ...(row.schemaValues !== null && row.schemaValues !== undefined
        ? { values: parseJson<Array<string | number>>(String(row.schemaValues)) }
        : {}),
    },
  }
}

const mapFieldValueRow = (row: Record<string, unknown> | null): SharedDbFieldValueRecord | undefined => {
  if (!row) return undefined
  return {
    fieldIndex: Number(row.fieldIndex),
    value: parseJson(String(row.valueJson)),
  }
}

const mapFieldSourceRow = (row: Record<string, unknown> | null): SharedDbFieldSourceRecord | undefined => {
  if (!row) return undefined
  return {
    childFieldIndex: Number(row.childFieldIndex),
    parentFieldIndex: Number(row.parentFieldIndex),
  }
}

/**
 * Создаёт и инициализирует SQLite-схему shared/db.
 *
 * @param database Открытая SQLite база.
 */
export const initializeSharedDbSqliteSchema = (database: Database): void => {
  database.exec(schemaSql)
  database.query(
    `INSERT INTO shared_db_meta(id, rootBraneIndex) VALUES (1, 0)
     ON CONFLICT(id) DO NOTHING`,
  ).run()
}

/**
 * Открывает SQLite backend для канонического shared/db контракта.
 *
 * @param options Опции открытия. По умолчанию используется in-memory SQLite.
 * @returns Shared/db backend-handle поверх SQLite.
 */
export const openSharedDbSqliteBackend = (options: SharedDbSqliteBackendOptions = {}): SharedDbBackend => {
  const database = new Database(options.filename ?? ":memory:")
  initializeSharedDbSqliteSchema(database)

  const statements = {
    selectRootBraneIndex: database.query(`SELECT rootBraneIndex FROM shared_db_meta WHERE id = 1`),
    upsertRootBraneIndex: database.query(
      `INSERT INTO shared_db_meta(id, rootBraneIndex) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET rootBraneIndex = excluded.rootBraneIndex`,
    ),
    clearFieldSources: database.query(`DELETE FROM field_sources`),
    clearFieldValues: database.query(`DELETE FROM field_values`),
    clearFields: database.query(`DELETE FROM fields`),
    clearBranes: database.query(`DELETE FROM branes`),
    insertBrane: database.query(
      `INSERT INTO branes("index", darkWimpId, src, name, fieldOffset, fieldCount)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    insertField: database.query(
      `INSERT INTO fields("index", darkFieldId, ownerBraneIndex, "key", schemaType, schemaRequired, schemaTopology, schemaLabel, schemaValues)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertFieldValue: database.query(
      `INSERT INTO field_values(fieldIndex, valueJson)
       VALUES (?, ?)`,
    ),
    insertFieldSource: database.query(
      `INSERT INTO field_sources(childFieldIndex, parentFieldIndex)
       VALUES (?, ?)`,
    ),
    selectBraneByIndex: database.query(`${braneSelectSql} WHERE "index" = ?`),
    selectBraneByDarkId: database.query(`${braneSelectSql} WHERE darkWimpId = ?`),
    selectFieldByIndex: database.query(`${fieldSelectSql} WHERE "index" = ?`),
    selectFieldByDarkId: database.query(`${fieldSelectSql} WHERE darkFieldId = ?`),
    selectFieldByKey: database.query(`${fieldSelectSql} WHERE ownerBraneIndex = ? AND "key" = ?`),
    selectFieldValueByIndex: database.query(`${fieldValueSelectSql} WHERE fieldIndex = ?`),
    selectFieldSourceByChildIndex: database.query(`${fieldSourceSelectSql} WHERE childFieldIndex = ?`),
    selectDependentFieldsByParentIndex: database.query(
      `${fieldSelectSql}
       INNER JOIN field_sources ON field_sources.childFieldIndex = fields."index"
       WHERE field_sources.parentFieldIndex = ?
       ORDER BY fields."index"`,
    ),
    ensureFieldExists: database.query(`SELECT 1 as present FROM fields WHERE "index" = ?`),
    upsertFieldValue: database.query(
      `INSERT INTO field_values(fieldIndex, valueJson)
       VALUES (?, ?)
       ON CONFLICT(fieldIndex) DO UPDATE SET valueJson = excluded.valueJson`,
    ),
  }

  const replaceAll = database.transaction((data: SharedDbTabularData) => {
    const normalized = normalizeSharedDbTabularData(data)
    statements.clearFieldSources.run()
    statements.clearFieldValues.run()
    statements.clearFields.run()
    statements.clearBranes.run()
    statements.upsertRootBraneIndex.run(normalized.rootBraneIndex)

    for (const brane of normalized.branes) {
      statements.insertBrane.run(
        brane.index,
        brane.darkWimpId,
        brane.src,
        brane.name ?? null,
        brane.fieldOffset,
        brane.fieldCount,
      )
    }

    for (const field of normalized.fields) {
      statements.insertField.run(
        field.index,
        field.darkFieldId,
        field.ownerBraneIndex,
        field.key,
        field.schema.type,
        Number(field.schema.required),
        Number(field.schema.topology),
        field.schema.label ?? null,
        field.schema.values !== undefined ? serializeJson(field.schema.values) : null,
      )
    }

    for (const fieldValue of normalized.fieldValues) {
      statements.insertFieldValue.run(fieldValue.fieldIndex, serializeJson(fieldValue.value))
    }

    for (const fieldSource of normalized.fieldSources) {
      statements.insertFieldSource.run(fieldSource.childFieldIndex, fieldSource.parentFieldIndex)
    }
  })

  return {
    requiredIndexes: sharedDbRequiredBackendIndexes,

    close() {
      database.close()
    },

    getRootBraneIndex() {
      const row = statements.selectRootBraneIndex.get() as Record<string, unknown> | null
      return row ? Number(row.rootBraneIndex) : 0
    },

    reset() {
      replaceAll(createEmptySharedDbTabularSnapshot())
    },

    replaceData(data) {
      replaceAll(data)
    },

    writeProjection(projection: SharedDbProjection) {
      replaceAll(prepareSharedDbTabularData(projection))
    },

    getBrane(braneIndex) {
      return mapBraneRow(statements.selectBraneByIndex.get(braneIndex) as Record<string, unknown> | null)
    },

    getBraneByDarkId(darkWimpId) {
      return mapBraneRow(statements.selectBraneByDarkId.get(darkWimpId) as Record<string, unknown> | null)
    },

    getField(fieldIndex) {
      return mapFieldRow(statements.selectFieldByIndex.get(fieldIndex) as Record<string, unknown> | null)
    },

    getFieldByDarkId(darkFieldId) {
      return mapFieldRow(statements.selectFieldByDarkId.get(darkFieldId) as Record<string, unknown> | null)
    },

    getFieldByKey(braneIndex, fieldKey) {
      return mapFieldRow(statements.selectFieldByKey.get(braneIndex, fieldKey) as Record<string, unknown> | null)
    },

    getFieldValue(fieldIndex) {
      return mapFieldValueRow(statements.selectFieldValueByIndex.get(fieldIndex) as Record<string, unknown> | null)
    },

    getFieldSource(childFieldIndex) {
      return mapFieldSourceRow(
        statements.selectFieldSourceByChildIndex.get(childFieldIndex) as Record<string, unknown> | null,
      )
    },

    getDependentFields(parentFieldIndex) {
      return (
        statements.selectDependentFieldsByParentIndex.all(parentFieldIndex) as Array<Record<string, unknown>>
      ).map((row) => mapFieldRow(row)!)
    },

    setFieldValue(fieldIndex, value) {
      const fieldExists = statements.ensureFieldExists.get(fieldIndex) as Record<string, unknown> | null
      if (!fieldExists) {
        throw new Error(`Field index out of range: ${fieldIndex}`)
      }

      statements.upsertFieldValue.run(fieldIndex, serializeJson(value))
    },
  }
}
