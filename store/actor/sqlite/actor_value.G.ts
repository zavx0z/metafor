import type { Database } from "bun:sqlite"
import type { ActorValueRecord } from "../actor_value.t.ts"

/** Декодирует строку sqlite в `ActorValueRecord`. */
export const decodeActorValue = (row: Record<string, unknown> | null): ActorValueRecord | null => {
  if (!row) return null
  return { actor: String(row.actor), metaField: String(row.metaField), value: String(row.value) }
}

/** Читает связь `actor_value` по (actor, metaField). */
export const readActorValue = async (
  db: Database,
  actor: string,
  metaField: string,
): Promise<ActorValueRecord | null> => {
  return decodeActorValue(
    db
      .prepare(`SELECT actor, metaField, value FROM actor_value WHERE actor = ? AND metaField = ?`)
      .get(actor, metaField) as Record<string, unknown> | null,
  )
}

/**
 * Кто разделяет это значение. Длина результата > 1 = entanglement.
 */
export const listValueOwners = async (db: Database, value: string): Promise<ActorValueRecord[]> => {
  const rows = db.prepare(`SELECT actor, metaField, value FROM actor_value WHERE value = ?`).all(value) as Array<
    Record<string, unknown>
  >
  return rows.map((row) => decodeActorValue(row)!) as ActorValueRecord[]
}
