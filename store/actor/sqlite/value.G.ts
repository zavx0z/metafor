import type { Database } from "bun:sqlite"
import type { ScalarKind, ValueItemRecord, ValueRecord } from "./value.t.ts"

/**
 * Читает запись `value` по uuid + одну строку из соответствующей типизированной
 * подтаблицы (value_boolean / value_number / value_string / value_enum).
 *
 * Один LEFT JOIN-запрос: дёшево даже с пустыми ветками. Строится discriminated
 * union по kind — нерелевантные поля просто отсутствуют.
 */
export const readValue = async (db: Database, uuid: string): Promise<ValueRecord | null> => {
  const row = db
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
       WHERE v.uuid = ?`,
    )
    .get(uuid) as Record<string, unknown> | null

  if (!row) return null

  const id = String(row.uuid)
  const kind = String(row.kind)
  switch (kind) {
    case "null":
      return { uuid: id, kind: "null" }
    case "boolean":
      return { uuid: id, kind: "boolean", boolean: row.boolean === 1 }
    case "number":
      return { uuid: id, kind: "number", number: Number(row.number) }
    case "string":
      return { uuid: id, kind: "string", text: String(row.text) }
    case "enum":
      return { uuid: id, kind: "enum", variant: String(row.variant) }
    case "list":
      return { uuid: id, kind: "list" }
    default:
      throw new Error(`Unknown value.kind '${kind}' for ${id}`)
  }
}

/**
 * Читает все элементы списочного значения, упорядочены по `position`.
 * Один JOIN-запрос корневой `value_list_item` с типизированными подтаблицами.
 */
export const readValueItems = async (db: Database, value: string): Promise<ValueItemRecord[]> => {
  const rows = db
    .prepare(
      `SELECT i.position AS position,
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
       WHERE i.value = ?
       ORDER BY i.position`,
    )
    .all(value) as Array<Record<string, unknown>>

  return rows.map((row) => {
    const position = Number(row.position)
    const kind = String(row.kind) as ScalarKind
    const base = { value, position }
    switch (kind) {
      case "null":
        return { ...base, kind: "null" }
      case "boolean":
        return { ...base, kind: "boolean", boolean: row.boolean === 1 }
      case "number":
        return { ...base, kind: "number", number: Number(row.number) }
      case "string":
        return { ...base, kind: "string", text: String(row.text) }
      case "enum":
        return { ...base, kind: "enum", variant: String(row.variant) }
      default:
        throw new Error(`Unknown value_list_item.kind '${kind}' at value=${value}, position=${position}`)
    }
  })
}
