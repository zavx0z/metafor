/**
 * `@store/actor` — реляционное хранилище инстансного слоя.
 *
 * 5 таблиц: actor + value + value_item + actor_value + actor_state.
 * Entanglement выражен через разделение записи `value` (один `value.uuid` —
 * несколько строк `actor_value`).
 *
 * См. `store/actor/README.md` и `store/README.md` для архитектурных принципов.
 */

export type {
  ActorRecord,
  ActorRows,
  ActorStateRecord,
  ActorValueRecord,
  Scalar,
  ScalarKind,
  ValueItemRecord,
  ValueKind,
  ValueRecord,
} from "./types.t.ts"

export {
  actorRequiredBackendIndexes,
  type ActorBackend,
  type ActorBackendAwaitable,
  type ActorBackendIndexSpec,
  type ActorBackendTableName,
} from "./backend.t.ts"

export {
  actorSchemaSql,
  actorTableNames,
  initializeActorSqliteSchema,
  resetActorSqliteSchema,
} from "./sqlite/schema.ts"

export {
  createSqliteActorBackend,
  type SqliteActorBackendOptions,
} from "./sqlite/store.ts"
