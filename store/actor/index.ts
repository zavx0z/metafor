/**
 * `@store/actor` — реляционное хранилище инстансного слоя.
 *
 * 5 таблиц: actor + value + value_item + actor_value + actor_state.
 * Entanglement выражен через разделение записи `value` (один `value.uuid` —
 * несколько строк `actor_value`).
 *
 * См. `store/actor/README.md` и `store/README.md` для архитектурных принципов.
 *
 * Публичный API минимален — только то, что нужно потребителю-фабрике стора.
 * Типы записей и контракт `ActorBackend` импортируются напрямую из соответствующих
 * файлов (`./backend.t.ts`, `./sqlite/<entity>.t.ts`, ...) когда понадобятся
 * конкретному месту, а не через единый прокси.
 */

export { createSqliteActorBackend } from "./sqlite/index.ts"
