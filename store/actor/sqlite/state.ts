/**
 * Сущность `actor_state` — текущая фаза FSM актора.
 *
 * Якорный файл сущности — под ним группируются:
 * - `state.sql` — DDL (actor PK, metaState FK→superposition.uuid)
 * - `state.G.ts` — Get (readActorState)
 * - `state.U.ts` — Update (setActorState upsert)
 */

export {}
