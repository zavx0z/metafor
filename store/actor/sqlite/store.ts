import { Database } from "bun:sqlite"
import {
  actorRequiredBackendIndexes,
  type ActorBackend,
  type ActorBackendIndexSpec,
} from "../backend.t.ts"
import type {
  ActorRecord,
  ActorStateRecord,
  ActorValueRecord,
  ValueItemRecord,
  ValueKind,
  ValueRecord,
} from "../types.t.ts"
import { initializeActorSqliteSchema, resetActorSqliteSchema } from "./schema.ts"

export interface SqliteActorBackendOptions {
  filename?: string
  database?: Database
}

const isFileBacked = (filename: string): boolean => filename !== ":memory:"

interface ScalarLike {
  kind: string
  boolean?: boolean
  number?: number
  text?: string
  variant?: string
}

const scalarColumns = (
  scalar: ScalarLike,
): { boolean: number | null; number: number | null; text: string | null; variant: string | null } => {
  if (scalar.kind === "null" || scalar.kind === "list") {
    return { boolean: null, number: null, text: null, variant: null }
  }
  return {
    boolean: typeof scalar.boolean === "boolean" ? (scalar.boolean ? 1 : 0) : null,
    number: typeof scalar.number === "number" ? scalar.number : null,
    text: typeof scalar.text === "string" ? scalar.text : null,
    variant: typeof scalar.variant === "string" ? scalar.variant : null,
  }
}

const decodeActor = (row: Record<string, unknown>): ActorRecord => ({
  uuid: String(row.uuid),
  parent: row.parent === null || row.parent === undefined ? null : String(row.parent),
  meta: String(row.meta),
  position: Number(row.position),
})

const decodeValue = (row: Record<string, unknown> | null): ValueRecord | null => {
  if (!row) return null
  const result: ValueRecord = { uuid: String(row.uuid), kind: String(row.kind) as ValueKind }
  if (row.boolean !== null && row.boolean !== undefined) result.boolean = row.boolean === 1
  if (row.number !== null && row.number !== undefined) result.number = Number(row.number)
  if (row.text !== null && row.text !== undefined) result.text = String(row.text)
  if (row.variant !== null && row.variant !== undefined) result.variant = String(row.variant)
  return result
}

const decodeValueItem = (row: Record<string, unknown>): ValueItemRecord => {
  const result: ValueItemRecord = {
    value: String(row.value),
    position: Number(row.position),
    kind: String(row.kind) as ValueItemRecord["kind"],
  }
  if (row.boolean !== null && row.boolean !== undefined) result.boolean = row.boolean === 1
  if (row.number !== null && row.number !== undefined) result.number = Number(row.number)
  if (row.text !== null && row.text !== undefined) result.text = String(row.text)
  if (row.variant !== null && row.variant !== undefined) result.variant = String(row.variant)
  return result
}

const decodeActorValue = (row: Record<string, unknown> | null): ActorValueRecord | null => {
  if (!row) return null
  return { actor: String(row.actor), metaField: String(row.metaField), value: String(row.value) }
}

const decodeActorState = (row: Record<string, unknown> | null): ActorStateRecord | null => {
  if (!row) return null
  return { actor: String(row.actor), metaState: String(row.metaState) }
}

const generateUuid = (): string => crypto.randomUUID()

/**
 * Bun-sqlite реализация {@link ActorBackend}.
 */
export const createSqliteActorBackend = (options: SqliteActorBackendOptions = {}): ActorBackend => {
  const owned = options.database === undefined
  const filename = options.filename ?? ":memory:"
  const db = options.database ?? new Database(filename, { strict: true, create: true })

  if (owned) {
    db.run("PRAGMA foreign_keys = ON;")
    if (isFileBacked(filename)) {
      db.run("PRAGMA journal_mode = WAL;")
      db.run("PRAGMA synchronous = NORMAL;")
      db.run("PRAGMA busy_timeout = 5000;")
    }
  }

  initializeActorSqliteSchema(db)

  const insertActorStmt = db.prepare(`INSERT INTO actor (uuid, parent, meta, position) VALUES (?, ?, ?, ?)`)
  const insertValueStmt = db.prepare(
    `INSERT INTO value (uuid, kind, boolean, number, text, variant) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const insertValueItemStmt = db.prepare(
    `INSERT INTO value_item (value, position, kind, boolean, number, text, variant) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertActorValueStmt = db.prepare(`INSERT INTO actor_value (actor, metaField, value) VALUES (?, ?, ?)`)
  const insertActorStateStmt = db.prepare(`INSERT INTO actor_state (actor, metaState) VALUES (?, ?)`)
  const deleteOrphanValueStmt = db.prepare(
    `DELETE FROM value WHERE uuid = ? AND NOT EXISTS (SELECT 1 FROM actor_value WHERE value = uuid)`,
  )

  const collectValueIdsForActor = (uuid: string): string[] => {
    const rows = db.prepare(`SELECT value FROM actor_value WHERE actor = ?`).all(uuid) as Array<{ value: string }>
    return rows.map((row) => row.value)
  }

  return {
    requiredIndexes: actorRequiredBackendIndexes as readonly ActorBackendIndexSpec[],

    async close() {
      if (owned) db.close()
    },

    async reset() {
      resetActorSqliteSchema(db)
    },

    async flush() {
      // sqlite WAL — checkpoint оставляем владельцу Database
    },

    async listRootActors() {
      const rows = db
        .prepare(`SELECT uuid, parent, meta, position FROM actor WHERE parent IS NULL ORDER BY position`)
        .all() as Array<Record<string, unknown>>
      return rows.map(decodeActor)
    },

    async listChildActors(parent) {
      const rows = db
        .prepare(`SELECT uuid, parent, meta, position FROM actor WHERE parent = ? ORDER BY position`)
        .all(parent) as Array<Record<string, unknown>>
      return rows.map(decodeActor)
    },

    async readActor(uuid) {
      const row = db.prepare(`SELECT uuid, parent, meta, position FROM actor WHERE uuid = ?`).get(uuid) as Record<
        string,
        unknown
      > | null
      return row ? decodeActor(row) : null
    },

    async readActorRows(uuid) {
      const actorRow = db
        .prepare(`SELECT uuid, parent, meta, position FROM actor WHERE uuid = ?`)
        .get(uuid) as Record<string, unknown> | null
      if (!actorRow) return null

      const values = (
        db.prepare(`SELECT actor, metaField, value FROM actor_value WHERE actor = ?`).all(uuid) as Array<
          Record<string, unknown>
        >
      ).map((row) => decodeActorValue(row)!) as ActorValueRecord[]

      const valueIds = [...new Set(values.map((v) => v.value))]
      const valueRecords: ValueRecord[] = []
      const valueItems: ValueItemRecord[] = []

      if (valueIds.length > 0) {
        const placeholders = valueIds.map(() => "?").join(", ")
        const valueRows = db
          .prepare(`SELECT uuid, kind, boolean, number, text, variant FROM value WHERE uuid IN (${placeholders})`)
          .all(...valueIds) as Array<Record<string, unknown>>
        for (const row of valueRows) {
          const decoded = decodeValue(row)
          if (decoded) valueRecords.push(decoded)
        }

        const itemRows = db
          .prepare(
            `SELECT value, position, kind, boolean, number, text, variant FROM value_item WHERE value IN (${placeholders}) ORDER BY value, position`,
          )
          .all(...valueIds) as Array<Record<string, unknown>>
        for (const row of itemRows) valueItems.push(decodeValueItem(row))
      }

      const state = decodeActorState(
        db.prepare(`SELECT actor, metaState FROM actor_state WHERE actor = ?`).get(uuid) as Record<
          string,
          unknown
        > | null,
      )
      if (!state) return null

      return {
        actor: decodeActor(actorRow),
        values,
        valueRecords,
        valueItems,
        state,
      }
    },

    async readActorState(actor) {
      return decodeActorState(
        db.prepare(`SELECT actor, metaState FROM actor_state WHERE actor = ?`).get(actor) as Record<
          string,
          unknown
        > | null,
      )
    },

    async readActorValue(actor, metaField) {
      return decodeActorValue(
        db
          .prepare(`SELECT actor, metaField, value FROM actor_value WHERE actor = ? AND metaField = ?`)
          .get(actor, metaField) as Record<string, unknown> | null,
      )
    },

    async readValue(uuid) {
      return decodeValue(
        db.prepare(`SELECT uuid, kind, boolean, number, text, variant FROM value WHERE uuid = ?`).get(uuid) as Record<
          string,
          unknown
        > | null,
      )
    },

    async readValueItems(value) {
      const rows = db
        .prepare(
          `SELECT value, position, kind, boolean, number, text, variant FROM value_item WHERE value = ? ORDER BY position`,
        )
        .all(value) as Array<Record<string, unknown>>
      return rows.map(decodeValueItem)
    },

    async listValueOwners(value) {
      const rows = db.prepare(`SELECT actor, metaField, value FROM actor_value WHERE value = ?`).all(value) as Array<
        Record<string, unknown>
      >
      return rows.map((row) => decodeActorValue(row)!) as ActorValueRecord[]
    },

    async writeActorRows(rows) {
      db.transaction(() => {
        // удалить актора целиком (каскад снесёт actor_value, actor_state; orphan-value подчистим ниже)
        const oldValueIds = collectValueIdsForActor(rows.actor.uuid)
        db.prepare(`DELETE FROM actor WHERE uuid = ?`).run(rows.actor.uuid)

        // вставить актора
        insertActorStmt.run(rows.actor.uuid, rows.actor.parent, rows.actor.meta, rows.actor.position)

        // вставить value-записи (UPSERT — если такая запись уже существует от другого актора, не пересоздаём)
        for (const v of rows.valueRecords) {
          const cols = scalarColumns(v)
          db.prepare(
            `INSERT INTO value (uuid, kind, boolean, number, text, variant) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (uuid) DO UPDATE SET kind=excluded.kind, boolean=excluded.boolean, number=excluded.number, text=excluded.text, variant=excluded.variant`,
          ).run(v.uuid, v.kind, cols.boolean, cols.number, cols.text, cols.variant)
        }

        // value_item: переписать набор для каждой записи
        const valueIdsToReplaceItems = new Set(rows.valueRecords.filter((v) => v.kind === "list").map((v) => v.uuid))
        for (const valueId of valueIdsToReplaceItems) {
          db.prepare(`DELETE FROM value_item WHERE value = ?`).run(valueId)
        }
        for (const item of rows.valueItems) {
          const cols = scalarColumns(item)
          insertValueItemStmt.run(item.value, item.position, item.kind, cols.boolean, cols.number, cols.text, cols.variant)
        }

        // вставить связи actor_value
        for (const av of rows.values) {
          insertActorValueStmt.run(av.actor, av.metaField, av.value)
        }

        // состояние
        insertActorStateStmt.run(rows.state.actor, rows.state.metaState)

        // подчистить orphan-value (которые после удаления актора больше никем не делятся)
        for (const valueId of oldValueIds) {
          deleteOrphanValueStmt.run(valueId)
        }
      })()
    },

    async deleteActor(uuid) {
      db.transaction(() => {
        const oldValueIds = collectValueIdsForActor(uuid)
        db.prepare(`DELETE FROM actor WHERE uuid = ?`).run(uuid)
        for (const valueId of oldValueIds) {
          deleteOrphanValueStmt.run(valueId)
        }
      })()
    },

    async setValue(uuid, scalar) {
      const cols = scalarColumns({ kind: scalar.kind, ...(scalar.kind !== "list" ? scalar : {}) } as ScalarLike)
      db.prepare(
        `UPDATE value SET kind = ?, boolean = ?, number = ?, text = ?, variant = ? WHERE uuid = ?`,
      ).run(scalar.kind, cols.boolean, cols.number, cols.text, cols.variant, uuid)
    },

    async writeValueItem(value, position, item) {
      const cols = scalarColumns(item)
      db.prepare(
        `INSERT INTO value_item (value, position, kind, boolean, number, text, variant) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (value, position) DO UPDATE SET kind=excluded.kind, boolean=excluded.boolean, number=excluded.number, text=excluded.text, variant=excluded.variant`,
      ).run(value, position, item.kind, cols.boolean, cols.number, cols.text, cols.variant)
    },

    async truncateValueItems(value, fromPosition) {
      db.prepare(`DELETE FROM value_item WHERE value = ? AND position >= ?`).run(value, fromPosition)
    },

    async setActorState(actor, metaState) {
      db.prepare(
        `INSERT INTO actor_state (actor, metaState) VALUES (?, ?)
         ON CONFLICT (actor) DO UPDATE SET metaState = excluded.metaState`,
      ).run(actor, metaState)
    },

    async shareValue(actor, metaField, value) {
      db.transaction(() => {
        const oldRow = db
          .prepare(`SELECT value FROM actor_value WHERE actor = ? AND metaField = ?`)
          .get(actor, metaField) as { value: string } | null
        const oldValueId = oldRow?.value
        db.prepare(
          `INSERT INTO actor_value (actor, metaField, value) VALUES (?, ?, ?)
           ON CONFLICT (actor, metaField) DO UPDATE SET value = excluded.value`,
        ).run(actor, metaField, value)
        if (oldValueId !== undefined && oldValueId !== value) {
          deleteOrphanValueStmt.run(oldValueId)
        }
      })()
    },

    async forkValue(actor, metaField) {
      const newUuid = generateUuid()
      db.transaction(() => {
        const sharedRow = db
          .prepare(`SELECT value FROM actor_value WHERE actor = ? AND metaField = ?`)
          .get(actor, metaField) as { value: string } | null
        if (!sharedRow) {
          throw new Error(`actor_value (${actor}, ${metaField}) not found — cannot fork`)
        }
        // копируем value-запись
        const sourceValue = db
          .prepare(`SELECT kind, boolean, number, text, variant FROM value WHERE uuid = ?`)
          .get(sharedRow.value) as Record<string, unknown> | null
        if (!sourceValue) throw new Error(`source value ${sharedRow.value} missing`)

        insertValueStmt.run(
          newUuid,
          String(sourceValue.kind),
          (sourceValue.boolean as number | null) ?? null,
          (sourceValue.number as number | null) ?? null,
          (sourceValue.text as string | null) ?? null,
          (sourceValue.variant as string | null) ?? null,
        )

        if (sourceValue.kind === "list") {
          const items = db
            .prepare(`SELECT position, kind, boolean, number, text, variant FROM value_item WHERE value = ?`)
            .all(sharedRow.value) as Array<Record<string, unknown>>
          for (const it of items) {
            insertValueItemStmt.run(
              newUuid,
              Number(it.position),
              String(it.kind),
              (it.boolean as number | null) ?? null,
              (it.number as number | null) ?? null,
              (it.text as string | null) ?? null,
              (it.variant as string | null) ?? null,
            )
          }
        }

        // переключаем actor_value на новую запись
        db.prepare(`UPDATE actor_value SET value = ? WHERE actor = ? AND metaField = ?`).run(newUuid, actor, metaField)
      })()
      return newUuid
    },
  }
}
