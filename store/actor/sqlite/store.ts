import { Database } from "bun:sqlite"
import {
  actorRequiredBackendIndexes,
  type ActorBackend,
  type ActorBackendIndexSpec,
} from "../backend.t.ts"
import type {
  ActorEdgeRecord,
  ActorEntanglementFamilyRows,
  ActorFieldRecord,
  ActorRecord,
  ActorRows,
  ActorScalar,
  ActorSourceRecord,
  ActorStateRecord,
  ActorValueItemRecord,
  ActorValueRecord,
} from "../types.t.ts"
import { initializeActorSqliteSchema, resetActorSqliteSchema } from "./schema.ts"

export interface SqliteActorBackendOptions {
  /** Путь к SQLite-файлу. По умолчанию `:memory:`. Игнорируется, если передан `database`. */
  filename?: string
  /** Уже открытый Database. Backend не открывает и не закрывает его. */
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
  kind: string,
  scalar: ScalarLike | null,
): { boolean: number | null; number: number | null; text: string | null; variant: string | null } => {
  if (scalar === null || kind === "null" || kind === "list") {
    return { boolean: null, number: null, text: null, variant: null }
  }
  return {
    boolean: typeof scalar.boolean === "boolean" ? (scalar.boolean ? 1 : 0) : null,
    number: typeof scalar.number === "number" ? scalar.number : null,
    text: typeof scalar.text === "string" ? scalar.text : null,
    variant: typeof scalar.variant === "string" ? scalar.variant : null,
  }
}

const decodeValueRow = (row: Record<string, unknown> | null): ActorValueRecord | null => {
  if (!row) return null
  const kind = String(row.kind) as ActorValueRecord["kind"]
  const result: ActorValueRecord = { field: String(row.field), kind }
  if (row.boolean !== null && row.boolean !== undefined) result.boolean = row.boolean === 1
  if (row.number !== null && row.number !== undefined) result.number = Number(row.number)
  if (row.text !== null && row.text !== undefined) result.text = String(row.text)
  if (row.variant !== null && row.variant !== undefined) result.variant = String(row.variant)
  return result
}

const decodeValueItemRow = (row: Record<string, unknown>): ActorValueItemRecord => {
  const kind = String(row.kind) as ActorValueItemRecord["kind"]
  const result: ActorValueItemRecord = {
    field: String(row.field),
    position: Number(row.position),
    kind,
  }
  if (row.boolean !== null && row.boolean !== undefined) result.boolean = row.boolean === 1
  if (row.number !== null && row.number !== undefined) result.number = Number(row.number)
  if (row.text !== null && row.text !== undefined) result.text = String(row.text)
  if (row.variant !== null && row.variant !== undefined) result.variant = String(row.variant)
  return result
}

const decodeFieldRow = (row: Record<string, unknown>): ActorFieldRecord => ({
  uuid: String(row.uuid),
  actor: String(row.actor),
  metaField: String(row.metaField),
  position: Number(row.position),
})

const decodeEdgeRow = (row: Record<string, unknown> | null): ActorEdgeRecord | null => {
  if (!row) return null
  return {
    child: String(row.child),
    parent: row.parent === null || row.parent === undefined ? null : String(row.parent),
    position: Number(row.position),
  }
}

const decodeStateRow = (row: Record<string, unknown> | null): ActorStateRecord | null => {
  if (!row) return null
  return { actor: String(row.actor), metaState: String(row.metaState) }
}

const decodeSourceRow = (row: Record<string, unknown> | null): ActorSourceRecord | null => {
  if (!row) return null
  return { childField: String(row.childField), parentField: String(row.parentField) }
}

const decodeActorRow = (row: Record<string, unknown>): ActorRecord => ({
  uuid: String(row.uuid),
  world: String(row.world),
  metaSrc: String(row.metaSrc),
  position: Number(row.position),
})

/**
 * Bun-sqlite реализация {@link ActorBackend}.
 *
 * Идемпотентна: повторное открытие на той же `Database` не пересоздаёт таблицы (DDL — IF NOT EXISTS).
 * Если backend владеет `Database` (открыл сам по `filename`) — закрывает её на `close()`.
 * Если получил `Database` извне — не закрывает (это ответственность caller-а).
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

  const insertActor = db.prepare(`INSERT INTO actor (uuid, world, metaSrc, position) VALUES (?, ?, ?, ?)`)
  const insertEdge = db.prepare(`INSERT INTO actor_edge (child, parent, position) VALUES (?, ?, ?)`)
  const insertField = db.prepare(`INSERT INTO actor_field (uuid, actor, metaField, position) VALUES (?, ?, ?, ?)`)
  const insertValue = db.prepare(
    `INSERT INTO actor_value (field, kind, boolean, number, text, variant) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const insertValueItem = db.prepare(
    `INSERT INTO actor_value_item (field, position, kind, boolean, number, text, variant) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertSource = db.prepare(`INSERT INTO actor_source (childField, parentField) VALUES (?, ?)`)
  const insertState = db.prepare(`INSERT INTO actor_state (actor, metaState) VALUES (?, ?)`)

  const writeActorRows = (rows: ActorRows): void => {
    db.transaction(() => {
      // Удаление полное per-actor: каскад FK снимет всё зависимое
      db.prepare(`DELETE FROM actor WHERE uuid = ?`).run(rows.actor.uuid)

      insertActor.run(rows.actor.uuid, rows.actor.world, rows.actor.metaSrc, rows.actor.position)
      insertEdge.run(rows.edge.child, rows.edge.parent, rows.edge.position)

      for (const field of rows.fields) {
        insertField.run(field.uuid, field.actor, field.metaField, field.position)
      }
      for (const value of rows.values) {
        const cols = scalarColumns(value.kind, value)
        insertValue.run(value.field, value.kind, cols.boolean, cols.number, cols.text, cols.variant)
      }
      for (const item of rows.valueItems) {
        const cols = scalarColumns(item.kind, item)
        insertValueItem.run(item.field, item.position, item.kind, cols.boolean, cols.number, cols.text, cols.variant)
      }
      for (const source of rows.sources) {
        insertSource.run(source.childField, source.parentField)
      }
      insertState.run(rows.state.actor, rows.state.metaState)
    })()
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
      // sqlite пишет синхронно в WAL — явный flush не нужен; checkpoint оставляем владельцу Database.
    },

    async listActorIds(world) {
      const rows = db.prepare(`SELECT uuid FROM actor WHERE world = ? ORDER BY position`).all(world) as Array<{
        uuid: string
      }>
      return rows.map((row) => row.uuid)
    },

    async listWorldActors(world) {
      const rows = db
        .prepare(`SELECT uuid, world, metaSrc, position FROM actor WHERE world = ? ORDER BY position`)
        .all(world) as Array<Record<string, unknown>>
      return rows.map(decodeActorRow)
    },

    async readActorRows(uuid) {
      const actorRow = db
        .prepare(`SELECT uuid, world, metaSrc, position FROM actor WHERE uuid = ?`)
        .get(uuid) as Record<string, unknown> | null
      if (!actorRow) return null

      const edgeRow = decodeEdgeRow(
        db.prepare(`SELECT child, parent, position FROM actor_edge WHERE child = ?`).get(uuid) as Record<
          string,
          unknown
        > | null,
      )
      if (!edgeRow) return null

      const fields = (
        db.prepare(`SELECT uuid, actor, metaField, position FROM actor_field WHERE actor = ? ORDER BY position`).all(
          uuid,
        ) as Array<Record<string, unknown>>
      ).map(decodeFieldRow)

      const fieldUuids = fields.map((f) => f.uuid)
      const placeholders = fieldUuids.map(() => "?").join(", ")
      const values: ActorValueRecord[] = []
      const valueItems: ActorValueItemRecord[] = []
      const sources: ActorSourceRecord[] = []
      if (fieldUuids.length > 0) {
        const valueRows = db
          .prepare(
            `SELECT field, kind, boolean, number, text, variant FROM actor_value WHERE field IN (${placeholders})`,
          )
          .all(...fieldUuids) as Array<Record<string, unknown>>
        for (const row of valueRows) {
          const decoded = decodeValueRow(row)
          if (decoded) values.push(decoded)
        }

        const itemRows = db
          .prepare(
            `SELECT field, position, kind, boolean, number, text, variant FROM actor_value_item WHERE field IN (${placeholders}) ORDER BY field, position`,
          )
          .all(...fieldUuids) as Array<Record<string, unknown>>
        for (const row of itemRows) valueItems.push(decodeValueItemRow(row))

        const sourceRows = db
          .prepare(
            `SELECT childField, parentField FROM actor_source WHERE childField IN (${placeholders})`,
          )
          .all(...fieldUuids) as Array<Record<string, unknown>>
        for (const row of sourceRows) {
          const decoded = decodeSourceRow(row)
          if (decoded) sources.push(decoded)
        }
      }

      const state = decodeStateRow(
        db.prepare(`SELECT actor, metaState FROM actor_state WHERE actor = ?`).get(uuid) as Record<
          string,
          unknown
        > | null,
      )
      if (!state) return null

      return {
        actor: decodeActorRow(actorRow),
        edge: edgeRow,
        fields,
        values,
        valueItems,
        sources,
        state,
      }
    },

    async readActorField(fieldUuid) {
      const row = db
        .prepare(`SELECT uuid, actor, metaField, position FROM actor_field WHERE uuid = ?`)
        .get(fieldUuid) as Record<string, unknown> | null
      return row ? decodeFieldRow(row) : null
    },

    async readActorEdge(child) {
      return decodeEdgeRow(
        db.prepare(`SELECT child, parent, position FROM actor_edge WHERE child = ?`).get(child) as Record<
          string,
          unknown
        > | null,
      )
    },

    async readActorValue(fieldUuid) {
      return decodeValueRow(
        db
          .prepare(`SELECT field, kind, boolean, number, text, variant FROM actor_value WHERE field = ?`)
          .get(fieldUuid) as Record<string, unknown> | null,
      )
    },

    async readActorSource(childField) {
      return decodeSourceRow(
        db.prepare(`SELECT childField, parentField FROM actor_source WHERE childField = ?`).get(childField) as Record<
          string,
          unknown
        > | null,
      )
    },

    async readActorState(actor) {
      return decodeStateRow(
        db.prepare(`SELECT actor, metaState FROM actor_state WHERE actor = ?`).get(actor) as Record<
          string,
          unknown
        > | null,
      )
    },

    async readEntanglementFamily(uuid) {
      const entanglement = db
        .prepare(`SELECT uuid, world, rootField FROM actor_entanglement WHERE uuid = ?`)
        .get(uuid) as Record<string, unknown> | null
      if (!entanglement) return null

      const members = (
        db
          .prepare(`SELECT entanglement, actor, position FROM actor_entanglement_member WHERE entanglement = ? ORDER BY position`)
          .all(uuid) as Array<Record<string, unknown>>
      ).map((row) => ({
        entanglement: String(row.entanglement),
        actor: String(row.actor),
        position: Number(row.position),
      }))

      const fields = (
        db
          .prepare(
            `SELECT uuid, entanglement, metaField, position FROM actor_entanglement_field WHERE entanglement = ? ORDER BY position`,
          )
          .all(uuid) as Array<Record<string, unknown>>
      ).map((row) => ({
        uuid: String(row.uuid),
        entanglement: String(row.entanglement),
        metaField: String(row.metaField),
        position: Number(row.position),
      }))

      const fieldUuids = fields.map((field) => field.uuid)
      const fieldMembers: ActorEntanglementFamilyRows["fieldMembers"] = []
      if (fieldUuids.length > 0) {
        const placeholders = fieldUuids.map(() => "?").join(", ")
        const rows = db
          .prepare(
            `SELECT entanglementField, actorField, position FROM actor_entanglement_field_member WHERE entanglementField IN (${placeholders}) ORDER BY entanglementField, position`,
          )
          .all(...fieldUuids) as Array<Record<string, unknown>>
        for (const row of rows) {
          fieldMembers.push({
            entanglementField: String(row.entanglementField),
            actorField: String(row.actorField),
            position: Number(row.position),
          })
        }
      }

      return {
        entanglement: {
          uuid: String(entanglement.uuid),
          world: String(entanglement.world),
          rootField: String(entanglement.rootField),
        },
        members,
        fields,
        fieldMembers,
      }
    },

    async writeActorRows(rows) {
      writeActorRows(rows)
    },

    async deleteActor(uuid) {
      db.prepare(`DELETE FROM actor WHERE uuid = ?`).run(uuid)
    },

    async setActorValue(fieldUuid, value) {
      const cols = scalarColumns(value.kind, value.kind === "list" ? null : (value as ActorScalar))
      db.transaction(() => {
        db.prepare(`DELETE FROM actor_value WHERE field = ?`).run(fieldUuid)
        if (value.kind !== "list") {
          insertValue.run(fieldUuid, value.kind, cols.boolean, cols.number, cols.text, cols.variant)
        } else {
          insertValue.run(fieldUuid, "list", null, null, null, null)
        }
      })()
    },

    async writeActorValueItem(fieldUuid, position, item) {
      const cols = scalarColumns(item.kind, item)
      db.prepare(
        `INSERT INTO actor_value_item (field, position, kind, boolean, number, text, variant)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (field, position) DO UPDATE SET
            kind = excluded.kind,
            boolean = excluded.boolean,
            number = excluded.number,
            text = excluded.text,
            variant = excluded.variant`,
      ).run(fieldUuid, position, item.kind, cols.boolean, cols.number, cols.text, cols.variant)
    },

    async truncateActorValueItems(fieldUuid, fromPosition) {
      db.prepare(`DELETE FROM actor_value_item WHERE field = ? AND position >= ?`).run(fieldUuid, fromPosition)
    },

    async setActorState(actor, metaState) {
      db.prepare(
        `INSERT INTO actor_state (actor, metaState) VALUES (?, ?)
         ON CONFLICT (actor) DO UPDATE SET metaState = excluded.metaState`,
      ).run(actor, metaState)
    },

    async writeEntanglementFamily(rows) {
      db.transaction(() => {
        db.prepare(`DELETE FROM actor_entanglement WHERE uuid = ?`).run(rows.entanglement.uuid)
        db.prepare(`INSERT INTO actor_entanglement (uuid, world, rootField) VALUES (?, ?, ?)`).run(
          rows.entanglement.uuid,
          rows.entanglement.world,
          rows.entanglement.rootField,
        )
        const memberStmt = db.prepare(
          `INSERT INTO actor_entanglement_member (entanglement, actor, position) VALUES (?, ?, ?)`,
        )
        for (const member of rows.members) {
          memberStmt.run(member.entanglement, member.actor, member.position)
        }
        const fieldStmt = db.prepare(
          `INSERT INTO actor_entanglement_field (uuid, entanglement, metaField, position) VALUES (?, ?, ?, ?)`,
        )
        for (const field of rows.fields) {
          fieldStmt.run(field.uuid, field.entanglement, field.metaField, field.position)
        }
        const memberFieldStmt = db.prepare(
          `INSERT INTO actor_entanglement_field_member (entanglementField, actorField, position) VALUES (?, ?, ?)`,
        )
        for (const member of rows.fieldMembers) {
          memberFieldStmt.run(member.entanglementField, member.actorField, member.position)
        }
      })()
    },

    async deleteEntanglementFamily(uuid) {
      db.prepare(`DELETE FROM actor_entanglement WHERE uuid = ?`).run(uuid)
    },
  }
}
