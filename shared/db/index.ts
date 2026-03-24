export {
  buildSharedDbProjectionIndexes,
  createEmptySharedDbTabularSnapshot,
  createSharedDbProjection,
  normalizeSharedDbTabularData,
  prepareSharedDbTabularData,
  readSharedDbProjection,
  readSharedDbTabularData,
  sharedDbRequiredBackendIndexes,
} from "./backend.ts"
export { createSharedDbProjectionFromWimpTraces, openSharedDbMaterializationWriter } from "./materialize.ts"
export {
  getSharedDbBraneByDarkId,
  getSharedDbBraneByIndex,
  getSharedDbBraneFields,
  getSharedDbDependentFields,
  getSharedDbFieldByDarkId,
  getSharedDbFieldByIndex,
  getSharedDbFieldByKey,
  getSharedDbFieldSource,
  getSharedDbFieldValue,
} from "./db.ts"
export { openSharedDbMemoryBackend } from "./memory.ts"
export { initializeSharedDbSqliteSchema, openSharedDbSqliteBackend } from "./sqlite.ts"
export type { SharedDbBackend, SharedDbBackendIndexSpec, SharedDbBackendTableName } from "./backend.t.ts"
export type { SharedDbSqliteBackendOptions } from "./sqlite.ts"
export type {
  SharedDbBraneRecord,
  SharedDbEntanglementSeedBlockMemberRecord,
  SharedDbEntanglementSeedBlockRecord,
  SharedDbEntanglementSeedFieldMemberRecord,
  SharedDbEntanglementSeedFieldRecord,
  SharedDbFieldRecord,
  SharedDbFieldSchemaRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbProjection,
  SharedDbProjectionIndexes,
  SharedDbRuntimeSeedData,
  SharedDbStateSeedConditionRecord,
  SharedDbStateSeedStateRecord,
  SharedDbStateSeedTransitionRecord,
  SharedDbTabularData,
} from "./db.t.ts"
export type { SharedDbMaterializationWriter, SharedDbWimpFieldTrace, SharedDbWimpTrace } from "./materialize.ts"
