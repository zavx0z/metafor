import type { Database } from "bun:sqlite"
import type { ActorRecord, ActorRows } from "./actor.t.ts"
import type { ActorStateRecord } from "./state.t.ts"
import type { ActorValueRecord } from "./actor_value.t.ts"
import type { ScalarKind, ValueItemRecord, ValueRecord } from "./value.t.ts"
import { decodeActorValue } from "./actor_value.G.ts"
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

/** Декодирует объединённую LEFT JOIN-строку (value + value_<kind>) в `ValueRecord`. */
const decodeValueJoinRow = (row: Record<string, unknown>): ValueRecord => {
  const uuid = String(row.uuid)
  const kind = String(row.kind)
  switch (kind) {
    case "null":
      return { uuid, kind: "null" }
    case "boolean":
      return { uuid, kind: "boolean", boolean: row.boolean === 1 }
    case "number":
      return { uuid, kind: "number", number: Number(row.number) }
    case "string":
      return { uuid, kind: "string", text: String(row.text) }
    case "enum":
      return { uuid, kind: "enum", variant: String(row.variant) }
    case "list":
      return { uuid, kind: "list" }
    default:
      throw new Error(`Unknown value.kind '${kind}' for ${uuid}`)
  }
}

/** Декодирует объединённую LEFT JOIN-строку (value_list_item + value_list_item_<kind>) в `ValueItemRecord`. */
const decodeListItemJoinRow = (row: Record<string, unknown>): ValueItemRecord => {
  const value = String(row.value)
  const position = Number(row.position)
  const kind = String(row.kind) as ScalarKind
  switch (kind) {
    case "null":
      return { value, position, kind: "null" }
    case "boolean":
      return { value, position, kind: "boolean", boolean: row.boolean === 1 }
    case "number":
      return { value, position, kind: "number", number: Number(row.number) }
    case "string":
      return { value, position, kind: "string", text: String(row.text) }
    case "enum":
      return { value, position, kind: "enum", variant: String(row.variant) }
    default:
      throw new Error(`Unknown value_list_item.kind '${kind}' at value=${value}, position=${position}`)
  }
}

/**
 * Читает row-group актора (actor + values + valueRecords + valueItems + state).
 * Один проход: SELECT actor → SELECT actor_value → JOIN-чтение value+подтаблиц по списку uuid.
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
      .prepare(
        `SELECT v.uuid AS uuid,
                v.kind AS kind,
                vb.boolean AS boolean,
                vn.number  AS number,
                vs.text    AS text,
                ve.variant AS variant
         FROM value v
              LEFT JOIN value_boolean vb ON vb.value = v.uuid
              LEFT JOIN value_number  vn ON vn.value = v.uuid
              LEFT JOIN value_string  vs ON vs.value = v.uuid
              LEFT JOIN value_enum    ve ON ve.value = v.uuid
         WHERE v.uuid IN (${placeholders})`,
      )
      .all(...valueIds) as Array<Record<string, unknown>>
    for (const row of valueRows) valueRecords.push(decodeValueJoinRow(row))

    const itemRows = db
      .prepare(
        `SELECT i.value    AS value,
                i.position AS position,
                i.kind     AS kind,
                ib.boolean AS boolean,
                inum.number AS number,
                ist.text   AS text,
                ie.variant AS variant
         FROM value_list_item i
              LEFT JOIN value_list_item_boolean ib   ON ib.value = i.value AND ib.position = i.position
              LEFT JOIN value_list_item_number  inum ON inum.value = i.value AND inum.position = i.position
              LEFT JOIN value_list_item_string  ist  ON ist.value = i.value AND ist.position = i.position
              LEFT JOIN value_list_item_enum    ie   ON ie.value = i.value AND ie.position = i.position
         WHERE i.value IN (${placeholders})
         ORDER BY i.value, i.position`,
      )
      .all(...valueIds) as Array<Record<string, unknown>>
    for (const row of itemRows) valueItems.push(decodeListItemJoinRow(row))
  }

  const state: ActorStateRecord | null = decodeActorState(
    db.prepare(`SELECT actor, metaState FROM actor_state WHERE actor = ?`).get(uuid) as Record<string, unknown> | null,
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
