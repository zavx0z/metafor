/**
 * Browser-safe entry point канонической DB-инфраструктуры.
 *
 * Не импортирует `bun:sqlite` ни прямо ни косвенно (поэтому идёт мимо `core.ts`,
 * который тащит SQLite-instance-store). Всё что нужно client-side viewport-у:
 * чистые типы, IDB-реализация {@link DbInstanceStore}, mirror и applier для
 * `db-sync` событий, IDB-backend для канонической DB.
 *
 * Server/worker сторона использует `pkg/db/index.ts` (со SQLite-частью).
 */
export { createEmptyDbData, normalizeDbData, readDbData, dbRequiredBackendIndexes } from "./backend.ts"
export { createDbEntanglementFamilyId, openDbMaterializationWriter } from "./materialize.ts"
export type {
  DbBackend,
  DbBackendIndexSpec,
  DbBackendTableName,
  DbEntanglementFamilyRows,
  DbMetaRows,
  DbWimpRows,
} from "./backend.t.ts"
export type {
  DbData,
  DbMaterializationWriter,
  DbMetaBundle,
  DbMetaFieldBundle,
  DbWimpBundle,
  DbWimpFieldBundle,
} from "./db.t.ts"
export type {
  DbFieldOrbitRow,
  DbFieldValueKind,
  DbParticleKind,
  DbParticleShellRow,
  DbWorldRows,
} from "./instance.t.ts"
export type { DbInstanceStore, DbInstanceStore as DbActorStore } from "./instance-store.t.ts"
export {
  createIdbDbInstanceStore,
  createIdbDbInstanceStore as createIdbDbActorStore,
} from "./idb-instance-store.ts"
export type {
  IdbDbInstanceStoreOptions,
  IdbDbInstanceStoreOptions as IdbDbActorStoreOptions,
} from "./idb-instance-store.ts"
export {
  applyDbSyncMessage,
  createMirroredInstanceStore,
  type DbSyncPublisher,
} from "./instance-store-mirror.ts"
export { inspectDbIndexedDbSchema, openDbIndexedDbBackend } from "./idb.ts"
export type { DbIndexedDbBackend, DbIndexedDbBackendOptions } from "./idb.ts"
