export { createEmptySharedDbData, normalizeSharedDbData, readSharedDbData, sharedDbRequiredBackendIndexes } from "./backend.ts"
export { createSharedDbDataFromWimpBundles, openSharedDbMaterializationWriter } from "./materialize.ts"
export {
  getSharedDbDependentFieldSources,
  getSharedDbEntanglementById,
  getSharedDbEntanglementFieldMembers,
  getSharedDbEntanglementFields,
  getSharedDbEntanglementMembers,
  getSharedDbFieldSource,
  getSharedDbFieldValue,
  getSharedDbMetaById,
  getSharedDbMetaFields,
  getSharedDbWimpById,
  getSharedDbWimpFields,
} from "./db.ts"
export { openSharedDbMemoryBackend } from "./memory.ts"
export { initializeSharedDbSqliteSchema, openSharedDbSqliteBackend } from "./sqlite.ts"
export type { SharedDbBackend, SharedDbBackendIndexSpec, SharedDbBackendTableName } from "./backend.t.ts"
export type { SharedDbSqliteBackendOptions } from "./sqlite.ts"
export type {
  SharedDbData,
  SharedDbEntanglementFieldMemberRecord,
  SharedDbEntanglementFieldRecord,
  SharedDbEntanglementMemberRecord,
  SharedDbEntanglementRecord,
  SharedDbFieldSchemaRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbMetaFieldRecord,
  SharedDbMetaMatterEdgeRecord,
  SharedDbMetaMatterNodeRecord,
  SharedDbMetaProcessReadRecord,
  SharedDbMetaProcessRecord,
  SharedDbMetaProcessWriteRecord,
  SharedDbMetaReactionReadRecord,
  SharedDbMetaReactionRecord,
  SharedDbMetaReactionStateRecord,
  SharedDbMetaReactionWriteRecord,
  SharedDbMetaRecord,
  SharedDbMetaStateRecord,
  SharedDbMetaTransitionConditionRecord,
  SharedDbMetaTransitionRecord,
  SharedDbWimpEdgeRecord,
  SharedDbWimpFieldRecord,
  SharedDbWimpRecord,
  SharedDbWimpStateRecord,
} from "./db.t.ts"
export type {
  SharedDbMaterializationWriter,
  SharedDbMetaBundle,
  SharedDbMetaFieldBundle,
  SharedDbWimpBundle,
  SharedDbWimpFieldBundle,
} from "./materialize.ts"
