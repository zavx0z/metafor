import type { Database } from "bun:sqlite"
import type { ActorRecord, ActorRows } from "../actor.t.ts"
import type { ActorStateRecord } from "../state.t.ts"
import type { ActorValueRecord } from "../actor_value.t.ts"
import type { ValueItemRecord, ValueRecord } from "../value.t.ts"
import { decodeActorValue } from "./actor_value.G.ts"
import { decodeValue, decodeValueItem } from "./value.G.ts"
import { decodeActorState } from "./state.G.ts"

/** Декодирует строку sqlite в `ActorRecord`. */
export const decodeActor = (row: Record<string, unknown>): ActorRecord => ({
  uuid: String(row.uuid),
  parent: row.parent === null || row.parent === undefined ? null : String(row.parent),
  meta: String(row.meta),
  position: Number(row.position),
})

/** Все корневые акторы (parent IS NULL), упорядочены по `position`. */
export const listRootActors = async (db: Database): Promise<ActorRecord[]> => {
  const rows = db
    .prepare(`SELECT uuid, parent, meta, position FROM actor WHERE parent IS NULL ORDER BY position`)
    .all() as Array<Record<string, unknown>>
  return rows.map(decodeActor)
}

/** Все дочерние акторы данного родителя, упорядочены по `position`. */
export const listChildActors = async (db: Database, parent: string): Promise<ActorRecord[]> => {
  const rows = db
    .prepare(`SELECT uuid, parent, meta, position FROM actor WHERE parent = ? ORDER BY position`)
    .all(parent) as Array<Record<string, unknown>>
  return rows.map(decodeActor)
}

/** Читает одного актора по uuid. */
export const readActor = async (db: Database, uuid: string): Promise<ActorRecord | null> => {
  const row = db.prepare(`SELECT uuid, parent, meta, position FROM actor WHERE uuid = ?`).get(uuid) as Record<
    string,
    unknown
  > | null
  return row ? decodeActor(row) : null
}

/**
 * Читает row-group актора (actor + values + valueRecords + valueItems + state) одной серией запросов.
 * Возвращает `null`, если актор или его state отсутствуют.
 */
export const readActorRows = async (db: Database, uuid: string): Promise<ActorRows | null> => {
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

  const state: ActorStateRecord | null = decodeActorState(
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
}
