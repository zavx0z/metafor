import type { Database } from "bun:sqlite"

/** Меняет состояние FSM актора (upsert по actor). */
export const setActorState = (db: Database, actor: string, metaState: string): void => {
  db.prepare(
    `INSERT INTO actor_state (actor, metaState) VALUES (?, ?)
     ON CONFLICT (actor) DO UPDATE SET metaState = excluded.metaState`,
  ).run(actor, metaState)
}
