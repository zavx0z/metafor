import type { Database } from "bun:sqlite"
import type { ValueItemRecord, ValueKind, ValueRecord } from "../value.t.ts"

/** Декодирует строку sqlite в `ValueRecord`. */
export const decodeValue = (row: Record<string, unknown> | null): ValueRecord | null => {
  if (!row) return null
  const result: ValueRecord = { uuid: String(row.uuid), kind: String(row.kind) as ValueKind }
  if (row.boolean !== null && row.boolean !== undefined) result.boolean = row.boolean === 1
  if (row.number !== null && row.number !== undefined) result.number = Number(row.number)
  if (row.text !== null && row.text !== undefined) result.text = String(row.text)
  if (row.variant !== null && row.variant !== undefined) result.variant = String(row.variant)
  return result
}

/** Декодирует строку sqlite в `ValueItemRecord`. */
export const decodeValueItem = (row: Record<string, unknown>): ValueItemRecord => {
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

/** Читает запись `value` по uuid. */
export const readValue = async (db: Database, uuid: string): Promise<ValueRecord | null> => {
  return decodeValue(
    db.prepare(`SELECT uuid, kind, boolean, number, text, variant FROM value WHERE uuid = ?`).get(uuid) as Record<
      string,
      unknown
    > | null,
  )
}

/** Читает все элементы списочного значения, упорядочены по `position`. */
export const readValueItems = async (db: Database, value: string): Promise<ValueItemRecord[]> => {
  const rows = db
    .prepare(
      `SELECT value, position, kind, boolean, number, text, variant FROM value_item WHERE value = ? ORDER BY position`,
    )
    .all(value) as Array<Record<string, unknown>>
  return rows.map(decodeValueItem)
}
