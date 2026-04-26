/**
 * Сущность `actor_state` — текущая фаза FSM актора.
 *
 * Якорный файл сущности — под ним группируются:
 * - `state.sql` — DDL (actor PK, metaState FK→superposition.uuid)
 * - `state.U.ts` — Update (setActorState upsert)
 *
 * Read-логика (Actor.state()) инлайнена в `actor.ts` точечным SELECT-ом по
 * `actor_state` — отдельного `state.G.ts` нет.
 */

export {}
