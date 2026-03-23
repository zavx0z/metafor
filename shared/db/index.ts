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
export type { SharedDbBackend, SharedDbBackendIndexSpec, SharedDbBackendTableName } from "./backend.t.ts"
export type {
  SharedDbBraneRecord,
  SharedDbFieldRecord,
  SharedDbFieldSchemaRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbProjection,
  SharedDbProjectionIndexes,
  SharedDbTabularData,
} from "./db.t.ts"
