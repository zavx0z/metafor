/**
 * `@store/actor` — реляционное хранилище инстансного слоя.
 *
 * 5 сущностей: actor + value + value_item + actor_value + actor_state.
 * Entanglement выражен через разделение записи `value` (один `value.uuid` —
 * несколько строк `actor_value`).
 *
 * Корневой entry-point держит **общий контракт** инстансного слоя — без привязки
 * к конкретному backend. Backend-специфичные имплементации лежат в subpath:
 * - `@store/actor/sqlite` — bun-sqlite реализация
 * - `@store/actor/idb` — IndexedDB реализация (планируется)
 *
 * См. `store/actor/README.md` и `store/README.md` для архитектурных принципов.
 */

export type { ActorBackend, ActorBackendIndexSpec, ActorBackendTableName } from "./backend.t.ts"
