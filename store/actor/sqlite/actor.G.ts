import type { SQL } from "bun"
import type { ActorRecord, ActorRows } from "./actor.t.ts"
import type { ActorStateRecord } from "./state.t.ts"
import type { ActorValueRecord } from "./actor_value.t.ts"
import type { ValueItemRecord, ValueRecord } from "./value.t.ts"
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
export const listRootActors = async (sql: SQL): Promise<ActorRecord[]> => {
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT uuid, parent, meta, position FROM actor WHERE parent IS NULL ORDER BY position
  `
  return rows.map(decodeActor)
}

/** Все дочерние акторы данного родителя, упорядочены по `position`. */
export const listChildActors = async (sql: SQL, parent: string): Promise<ActorRecord[]> => {
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT uuid, parent, meta, position FROM actor WHERE parent = ${parent} ORDER BY position
  `
  return rows.map(decodeActor)
}

/** Читает одного актора по uuid. */
export const readActor = async (sql: SQL, uuid: string): Promise<ActorRecord | null> => {
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT uuid, parent, meta, position FROM actor WHERE uuid = ${uuid}
  `
  const row = rows[0] ?? null
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

/** Декодирует строку `value_list_item` в `ValueItemRecord`. */
const decodeListItemRow = (row: Record<string, unknown>): ValueItemRecord => ({
  value: String(row.value),
  position: Number(row.position),
  itemValue: String(row.item_value),
})

/**
 * Читает row-group актора (actor + values + valueRecords + valueItems + state).
 * Один проход: SELECT actor → SELECT actor_value → JOIN-чтение value+подтаблиц по списку uuid.
 * Возвращает `null`, если актор или его state отсутствуют.
 */
export const readActorRows = async (sql: SQL, uuid: string): Promise<ActorRows | null> => {
  const actorRows = await sql<Array<Record<string, unknown>>>`
    SELECT uuid, parent, meta, position FROM actor WHERE uuid = ${uuid}
  `
  const actorRow = actorRows[0] ?? null
  if (!actorRow) return null

  const values = (
    await sql<Array<Record<string, unknown>>>`SELECT actor, field, value FROM actor_value WHERE actor = ${uuid}`
  ).map((row) => decodeActorValue(row)!) as ActorValueRecord[]

  const valueIds = [...new Set(values.map((v) => v.value))]
  const valueRecords: ValueRecord[] = []
  const valueItems: ValueItemRecord[] = []

  if (valueIds.length > 0) {
    const valueRows = await sql<Array<Record<string, unknown>>>`
      SELECT v.uuid AS uuid,
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
      WHERE v.uuid IN ${sql(valueIds)}
    `
    for (const row of valueRows) valueRecords.push(decodeValueJoinRow(row))

    const itemRows = await sql<Array<Record<string, unknown>>>`
      SELECT value, position, item_value FROM value_list_item
      WHERE value IN ${sql(valueIds)}
      ORDER BY value, position
    `
    for (const row of itemRows) valueItems.push(decodeListItemRow(row))
  }

  const stateRows = await sql<Array<Record<string, unknown>>>`
    SELECT actor, metaState FROM actor_state WHERE actor = ${uuid}
  `
  const state: ActorStateRecord | null = decodeActorState(stateRows[0] ?? null)
  if (!state) return null

  return {
    actor: decodeActor(actorRow),
    values,
    valueRecords,
    valueItems,
    state,
  }
}
