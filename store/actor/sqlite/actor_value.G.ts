import type { SQL } from "bun"
import type { ActorValueRecord } from "./actor_value.t.ts"

/** Декодирует строку sqlite в `ActorValueRecord`. */
export const decodeActorValue = (row: Record<string, unknown> | null): ActorValueRecord | null => {
  if (!row) return null
  return { actor: String(row.actor), field: String(row.field), value: String(row.value) }
}

/** Читает связь `actor_value` по (actor, field). */
export const readActorValue = async (
  sql: SQL,
  actor: string,
  field: string,
): Promise<ActorValueRecord | null> => {
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT actor, field, value FROM actor_value WHERE actor = ${actor} AND field = ${field}
  `
  return decodeActorValue(rows[0] ?? null)
}

/**
 * Кто разделяет это значение. Длина результата > 1 = entanglement.
 */
export const listValueOwners = async (sql: SQL, value: string): Promise<ActorValueRecord[]> => {
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT actor, field, value FROM actor_value WHERE value = ${value}
  `
  return rows.map((row) => decodeActorValue(row)!) as ActorValueRecord[]
}
