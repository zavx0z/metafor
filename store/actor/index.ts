/**
 * `@store/actor` — реляционное хранилище инстансного слоя.
 *
 * См. `store/actor/README.md` и `store/README.md` для архитектурных принципов.
 */

export type {
  ActorEdgeRecord,
  ActorEntanglementFamilyRows,
  ActorEntanglementFieldMemberRecord,
  ActorEntanglementFieldRecord,
  ActorEntanglementMemberRecord,
  ActorEntanglementRecord,
  ActorFieldRecord,
  ActorRecord,
  ActorRows,
  ActorScalar,
  ActorScalarKind,
  ActorSourceRecord,
  ActorStateRecord,
  ActorValueItemRecord,
  ActorValueKind,
  ActorValueRecord,
} from "./types.t.ts"

export {
  actorRequiredBackendIndexes,
  type ActorBackend,
  type ActorBackendAwaitable,
  type ActorBackendIndexSpec,
  type ActorBackendTableName,
} from "./backend.t.ts"

export {
  initializeActorSqliteSchema,
  resetActorSqliteSchema,
} from "./sqlite/schema.ts"

export {
  createSqliteActorBackend,
  type SqliteActorBackendOptions,
} from "./sqlite/store.ts"
