import type { SQL } from "bun"

/** Меняет состояние FSM актора (upsert по actor). */
export const setActorState = async (sql: SQL, actor: string, metaState: string): Promise<void> => {
  await sql`
    INSERT INTO actor_state (actor, metaState) VALUES (${actor}, ${metaState})
    ON CONFLICT (actor) DO UPDATE SET metaState = excluded.metaState
  `
}
