/**
 * Browser-safe entry point канонической DB-инфраструктуры.
 *
 * Не импортирует `bun:sqlite` ни прямо ни косвенно (поэтому идёт мимо `core.ts`,
 * который тащит SQLite actor-store). Всё что нужно client-side viewport-у:
 * чистые типы, IDB-реализация {@link DbActorStore}, mirror и applier для
 * `db-sync` событий, IDB-backend для канонической DB.
 *
 * Server/worker сторона использует `store/db` (со SQLite-частью).
 */
export { createEmptyDbData, normalizeDbData, dbRequiredBackendIndexes } from "./backend.ts"
export { createDbEntanglementFamilyId, openDbMaterializationWriter } from "../materialize.ts"
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
export { inspectDbIndexedDbSchema, openDbIndexedDbBackend } from "./idb.ts"
export type { DbIndexedDbBackend, DbIndexedDbBackendOptions } from "./idb.ts"
