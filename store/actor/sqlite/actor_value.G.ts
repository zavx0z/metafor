import type { Database } from "bun:sqlite"
import type { ActorValueRecord } from "./actor_value.t.ts"

/** Декодирует строку sqlite в `ActorValueRecord`. */
export const decodeActorValue = (row: Record<string, unknown> | null): ActorValueRecord | null => {
  if (!row) return null
  return { actor: String(row.actor), field: String(row.field), value: String(row.value) }
}

/** Читает связь `actor_value` по (actor, field). */
export const readActorValue = (
  db: Database,
  actor: string,
  field: string,
): ActorValueRecord | null => {
  return decodeActorValue(
    db
      .prepare(`SELECT actor, field, value FROM actor_value WHERE actor = ? AND field = ?`)
      .get(actor, field) as Record<string, unknown> | null,
  )
}

/**
 * Кто разделяет это значение. Длина результата > 1 = entanglement.
 */
export const listValueOwners = (db: Database, value: string): ActorValueRecord[] => {
  const rows = db.prepare(`SELECT actor, field, value FROM actor_value WHERE value = ?`).all(value) as Array<
    Record<string, unknown>
  >
  return rows.map((row) => decodeActorValue(row)!) as ActorValueRecord[]
}
