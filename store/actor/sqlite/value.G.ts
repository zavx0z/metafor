import type { Database } from "bun:sqlite"
import type { ValueItemRecord, ValueRecord } from "./value.t.ts"

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

/** Читает все элементы списочного значения, упорядочены по `position`. */
export const readValueItems = async (db: Database, value: string): Promise<ValueItemRecord[]> => {
  const rows = db
    .prepare(`SELECT value, position, item_value FROM value_list_item WHERE value = ? ORDER BY position`)
    .all(value) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    value: String(row.value),
    position: Number(row.position),
    itemValue: String(row.item_value),
  }))
}
