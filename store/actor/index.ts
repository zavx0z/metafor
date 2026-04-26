/**
 * `@store/actor` — реляционное хранилище инстансного слоя.
 *
 * 5 сущностей: actor + value + value_item + actor_value + actor_state.
 * Entanglement выражен через разделение записи `value` (один `value.uuid` —
 * несколько строк `actor_value`).
 *
 * См. `store/actor/README.md` и `store/README.md` для архитектурных принципов.
 */

export { createSqliteActorBackend } from "./sqlite/index.ts"
export type { ActorBackend } from "./backend.t.ts"
