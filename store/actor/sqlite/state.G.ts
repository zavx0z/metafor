import type { Database } from "bun:sqlite"
import type { ActorStateRecord } from "../state.t.ts"

/** Декодирует строку sqlite в `ActorStateRecord`. */
export const decodeActorState = (row: Record<string, unknown> | null): ActorStateRecord | null => {
  if (!row) return null
  return { actor: String(row.actor), metaState: String(row.metaState) }
}

/** Читает текущее состояние FSM актора. */
export const readActorState = async (db: Database, actor: string): Promise<ActorStateRecord | null> => {
  return decodeActorState(
    db.prepare(`SELECT actor, metaState FROM actor_state WHERE actor = ?`).get(actor) as Record<
      string,
      unknown
    > | null,
  )
}
