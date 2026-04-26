import type { SQL } from "bun"
import type { ActorStateRecord } from "./state.t.ts"

/** Декодирует строку sqlite в `ActorStateRecord`. */
export const decodeActorState = (row: Record<string, unknown> | null): ActorStateRecord | null => {
  if (!row) return null
  return { actor: String(row.actor), metaState: String(row.metaState) }
}

/** Читает текущее состояние FSM актора. */
export const readActorState = async (sql: SQL, actor: string): Promise<ActorStateRecord | null> => {
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT actor, metaState FROM actor_state WHERE actor = ${actor}
  `
  return decodeActorState(rows[0] ?? null)
}
