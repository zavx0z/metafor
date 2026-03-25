import { createEmptySharedDbData, normalizeSharedDbData, sharedDbRequiredBackendIndexes } from "./backend.ts"
import type { SharedDbBackend, SharedDbBackendTableName, SharedDbEntanglementFamilyRows, SharedDbMetaRows, SharedDbWimpRows } from "./backend.t.ts"
import type {
  SharedDbData,
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
  SharedDbEntanglementRecord,
  SharedDbEntanglementMemberRecord,
  SharedDbEntanglementFieldRecord,
  SharedDbEntanglementFieldMemberRecord,
} from "./db.t.ts"

export interface SharedDbIndexedDbBackendOptions {
  databaseName?: string
  version?: number
  indexedDb?: IDBFactory
}

export interface SharedDbIndexedDbBackend extends SharedDbBackend {
  flush(): Promise<void>
}

const DEFAULT_INDEXED_DB_NAME = "metafor-shared-db"
const DEFAULT_INDEXED_DB_VERSION = 1

const indexedDbTableConfigs = [
  { table: "metas", dataKey: "metas" },
  { table: "meta_fields", dataKey: "metaFields" },
  { table: "meta_states", dataKey: "metaStates" },
  { table: "meta_transitions", dataKey: "metaTransitions" },
  { table: "meta_transition_conditions", dataKey: "metaTransitionConditions" },
  { table: "meta_processes", dataKey: "metaProcesses" },
  { table: "meta_process_reads", dataKey: "metaProcessReads" },
  { table: "meta_process_writes", dataKey: "metaProcessWrites" },
  { table: "meta_reactions", dataKey: "metaReactions" },
  { table: "meta_reaction_states", dataKey: "metaReactionStates" },
  { table: "meta_reaction_reads", dataKey: "metaReactionReads" },
  { table: "meta_reaction_writes", dataKey: "metaReactionWrites" },
  { table: "meta_matter_nodes", dataKey: "metaMatterNodes" },
  { table: "meta_matter_edges", dataKey: "metaMatterEdges" },
  { table: "wimps", dataKey: "wimps" },
  { table: "wimp_fields", dataKey: "wimpFields" },
  { table: "wimp_edges", dataKey: "wimpEdges" },
  { table: "field_values", dataKey: "fieldValues" },
  { table: "field_sources", dataKey: "fieldSources" },
  { table: "wimp_states", dataKey: "wimpStates" },
  { table: "entanglements", dataKey: "entanglements" },
  { table: "entanglement_members", dataKey: "entanglementMembers" },
  { table: "entanglement_fields", dataKey: "entanglementFields" },
  { table: "entanglement_field_members", dataKey: "entanglementFieldMembers" },
] as const satisfies ReadonlyArray<{ table: SharedDbBackendTableName; dataKey: keyof SharedDbData }>

const indexedDbTableNames = indexedDbTableConfigs.map((config) => config.table)
const indexedDbIndexUniqueBlacklist = new Set([
  "meta_matter_edges_by_parent_and_edge_order",
  "wimp_edges_by_parent_and_order",
])

const cloneRow = <T>(row: T): T => structuredClone(row)
const cloneRows = <T>(rows: T[]): T[] => rows.map(cloneRow)

const getIndexedDbFactory = (options: SharedDbIndexedDbBackendOptions): IDBFactory => {
  if (options.indexedDb) return options.indexedDb

  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this runtime. Pass options.indexedDb explicitly.")
  }

  return indexedDB
}

const openIndexedDb = async (
  factory: IDBFactory,
  databaseName: string,
  version: number,
): Promise<IDBDatabase> =>
  await new Promise((resolve, reject) => {
    const request = factory.open(databaseName, version)

    request.onupgradeneeded = () => {
      const database = request.result

      indexedDbTableConfigs.forEach((config) => {
        const store = database.objectStoreNames.contains(config.table)
          ? request.transaction!.objectStore(config.table)
          : database.createObjectStore(config.table, { keyPath: "id" })

        sharedDbRequiredBackendIndexes
          .filter((index) => index.table === config.table)
          .forEach((index) => {
            if (store.indexNames.contains(index.name)) return
            store.createIndex(index.name, [...index.columns], {
              unique: index.unique && !indexedDbIndexUniqueBlacklist.has(index.name),
            })
          })
      })
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error(`Failed to open IndexedDB database ${databaseName}`))
  })

const runIndexedDbTransaction = async (
  database: IDBDatabase,
  storeNames: readonly string[],
  mode: IDBTransactionMode,
  action: (transaction: IDBTransaction) => void,
): Promise<void> =>
  await new Promise((resolve, reject) => {
    const transaction = database.transaction([...storeNames], mode)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"))
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"))

    try {
      action(transaction)
    } catch (error) {
      reject(error)
    }
  })

const readAllIndexedDbData = async (database: IDBDatabase): Promise<SharedDbData> => {
  const requests = new Map<keyof SharedDbData, IDBRequest<unknown[]>>()

  await runIndexedDbTransaction(database, indexedDbTableNames, "readonly", (transaction) => {
    indexedDbTableConfigs.forEach((config) => {
      requests.set(config.dataKey, transaction.objectStore(config.table).getAll())
    })
  })

  const data = createEmptySharedDbData()
  indexedDbTableConfigs.forEach((config) => {
    data[config.dataKey] = cloneRows((requests.get(config.dataKey)?.result ?? []) as SharedDbData[typeof config.dataKey])
  })

  return normalizeSharedDbData(data)
}

const persistAllIndexedDbData = async (database: IDBDatabase, data: SharedDbData): Promise<void> => {
  const snapshot = normalizeSharedDbData(data)

  await runIndexedDbTransaction(database, indexedDbTableNames, "readwrite", (transaction) => {
    indexedDbTableConfigs.forEach((config) => {
      const store = transaction.objectStore(config.table)
      store.clear()
      snapshot[config.dataKey].forEach((row) => {
        store.put(cloneRow(row))
      })
    })
  })
}

const replaceById = <T extends { id: string }>(rows: T[], nextRow: T): T[] => [
  ...rows.filter((row) => row.id !== nextRow.id),
  cloneRow(nextRow),
]

const removeMetaRowsFromCache = (data: SharedDbData, ownerMetaId: string): void => {
  const metaStateIds = new Set(data.metaStates.filter((row) => row.ownerMetaId === ownerMetaId).map((row) => row.id))
  const metaTransitionIds = new Set(
    data.metaTransitions.filter((row) => metaStateIds.has(row.ownerMetaStateId)).map((row) => row.id),
  )
  const metaProcessIds = new Set(data.metaProcesses.filter((row) => row.ownerMetaId === ownerMetaId).map((row) => row.id))
  const metaReactionIds = new Set(data.metaReactions.filter((row) => row.ownerMetaId === ownerMetaId).map((row) => row.id))

  data.metas = data.metas.filter((row) => row.id !== ownerMetaId)
  data.metaFields = data.metaFields.filter((row) => row.ownerMetaId !== ownerMetaId)
  data.metaStates = data.metaStates.filter((row) => row.ownerMetaId !== ownerMetaId)
  data.metaTransitions = data.metaTransitions.filter((row) => !metaStateIds.has(row.ownerMetaStateId))
  data.metaTransitionConditions = data.metaTransitionConditions.filter(
    (row) => !metaTransitionIds.has(row.ownerMetaTransitionId),
  )
  data.metaProcesses = data.metaProcesses.filter((row) => row.ownerMetaId !== ownerMetaId)
  data.metaProcessReads = data.metaProcessReads.filter((row) => !metaProcessIds.has(row.ownerMetaProcessId))
  data.metaProcessWrites = data.metaProcessWrites.filter((row) => !metaProcessIds.has(row.ownerMetaProcessId))
  data.metaReactions = data.metaReactions.filter((row) => row.ownerMetaId !== ownerMetaId)
  data.metaReactionStates = data.metaReactionStates.filter((row) => !metaReactionIds.has(row.ownerMetaReactionId))
  data.metaReactionReads = data.metaReactionReads.filter((row) => !metaReactionIds.has(row.ownerMetaReactionId))
  data.metaReactionWrites = data.metaReactionWrites.filter((row) => !metaReactionIds.has(row.ownerMetaReactionId))
  data.metaMatterNodes = data.metaMatterNodes.filter((row) => row.ownerMetaId !== ownerMetaId)
  data.metaMatterEdges = data.metaMatterEdges.filter((row) => row.ownerMetaId !== ownerMetaId)
}

const applyMetaRowsToCache = (data: SharedDbData, rows: SharedDbMetaRows): void => {
  removeMetaRowsFromCache(data, rows.meta.id)
  data.metas = replaceById(data.metas, rows.meta)
  data.metaFields.push(...cloneRows(rows.fields))
  data.metaStates.push(...cloneRows(rows.states))
  data.metaTransitions.push(...cloneRows(rows.transitions))
  data.metaTransitionConditions.push(...cloneRows(rows.transitionConditions))
  data.metaProcesses.push(...cloneRows(rows.processes))
  data.metaProcessReads.push(...cloneRows(rows.processReads))
  data.metaProcessWrites.push(...cloneRows(rows.processWrites))
  data.metaReactions.push(...cloneRows(rows.reactions))
  data.metaReactionStates.push(...cloneRows(rows.reactionStates))
  data.metaReactionReads.push(...cloneRows(rows.reactionReads))
  data.metaReactionWrites.push(...cloneRows(rows.reactionWrites))
  data.metaMatterNodes.push(...cloneRows(rows.matterNodes))
  data.metaMatterEdges.push(...cloneRows(rows.matterEdges))
}

const removeWimpRowsFromCache = (data: SharedDbData, ownerWimpId: string): void => {
  const wimpFieldIds = new Set(data.wimpFields.filter((row) => row.ownerWimpId === ownerWimpId).map((row) => row.id))

  data.wimps = data.wimps.filter((row) => row.id !== ownerWimpId)
  data.wimpFields = data.wimpFields.filter((row) => row.ownerWimpId !== ownerWimpId)
  data.fieldValues = data.fieldValues.filter((row) => !wimpFieldIds.has(row.ownerWimpFieldId))
  data.fieldSources = data.fieldSources.filter(
    (row) => !wimpFieldIds.has(row.childWimpFieldId) && !wimpFieldIds.has(row.parentWimpFieldId),
  )
  data.wimpStates = data.wimpStates.filter((row) => row.ownerWimpId !== ownerWimpId)
}

const applyWimpRowsToCache = (data: SharedDbData, rows: SharedDbWimpRows): void => {
  removeWimpRowsFromCache(data, rows.wimp.id)
  data.wimps = replaceById(data.wimps, rows.wimp)
  data.wimpFields.push(...cloneRows(rows.fields))
  data.fieldValues.push(...cloneRows(rows.values))
  data.fieldSources.push(...cloneRows(rows.sources))
  data.wimpStates = replaceById(data.wimpStates, rows.state)
}

const applyWimpEdgeToCache = (data: SharedDbData, row: SharedDbWimpEdgeRecord): void => {
  data.wimpEdges = [...data.wimpEdges.filter((candidate) => candidate.childWimpId !== row.childWimpId), cloneRow(row)]
}

const removeEntanglementFamilyFromCache = (data: SharedDbData, entanglementId: string): void => {
  const entanglementFieldIds = new Set(
    data.entanglementFields.filter((row) => row.ownerEntanglementId === entanglementId).map((row) => row.id),
  )

  data.entanglements = data.entanglements.filter((row) => row.id !== entanglementId)
  data.entanglementMembers = data.entanglementMembers.filter((row) => row.ownerEntanglementId !== entanglementId)
  data.entanglementFields = data.entanglementFields.filter((row) => row.ownerEntanglementId !== entanglementId)
  data.entanglementFieldMembers = data.entanglementFieldMembers.filter(
    (row) => !entanglementFieldIds.has(row.ownerEntanglementFieldId),
  )
}

const applyEntanglementFamilyToCache = (data: SharedDbData, rows: SharedDbEntanglementFamilyRows): void => {
  removeEntanglementFamilyFromCache(data, rows.entanglement.id)
  data.entanglements = replaceById(data.entanglements, rows.entanglement)
  data.entanglementMembers.push(...cloneRows(rows.members))
  data.entanglementFields = replaceById(data.entanglementFields, rows.field)
  data.entanglementFieldMembers.push(...cloneRows(rows.fieldMembers))
}

const setFieldValueInCache = (data: SharedDbData, wimpFieldId: string, value: unknown): void => {
  const row = data.fieldValues.find((candidate) => candidate.ownerWimpFieldId === wimpFieldId)
  if (!row) {
    throw new Error(`Field value not found for wimp field ${wimpFieldId}`)
  }

  row.value = structuredClone(value)
}

export const openSharedDbIndexedDbBackend = async (
  options: SharedDbIndexedDbBackendOptions = {},
): Promise<SharedDbIndexedDbBackend> => {
  const factory = getIndexedDbFactory(options)
  const database = await openIndexedDb(
    factory,
    options.databaseName ?? DEFAULT_INDEXED_DB_NAME,
    options.version ?? DEFAULT_INDEXED_DB_VERSION,
  )

  let cache = await readAllIndexedDbData(database)
  let persistenceQueue = Promise.resolve()
  let closed = false

  const assertOpen = (): void => {
    if (closed) {
      throw new Error("IndexedDB backend is closed")
    }
  }

  const schedulePersistence = (): void => {
    const snapshot = normalizeSharedDbData(cache)
    persistenceQueue = persistenceQueue.then(() => persistAllIndexedDbData(database, snapshot))
  }

  return {
    requiredIndexes: sharedDbRequiredBackendIndexes,

    close() {
      if (closed) return
      closed = true
      void persistenceQueue.finally(() => {
        database.close()
      })
    },

    reset() {
      assertOpen()
      cache = createEmptySharedDbData()
      schedulePersistence()
    },

    readData() {
      assertOpen()
      return normalizeSharedDbData(cache)
    },

    writeMetaRows(rows) {
      assertOpen()
      applyMetaRowsToCache(cache, rows)
      schedulePersistence()
    },

    writeWimpRows(rows) {
      assertOpen()
      applyWimpRowsToCache(cache, rows)
      schedulePersistence()
    },

    writeWimpEdge(row) {
      assertOpen()
      applyWimpEdgeToCache(cache, row)
      schedulePersistence()
    },

    deleteEntanglementFamily(entanglementId) {
      assertOpen()
      removeEntanglementFamilyFromCache(cache, entanglementId)
      schedulePersistence()
    },

    writeEntanglementFamily(rows) {
      assertOpen()
      applyEntanglementFamilyToCache(cache, rows)
      schedulePersistence()
    },

    setFieldValue(wimpFieldId, value) {
      assertOpen()
      setFieldValueInCache(cache, wimpFieldId, value)
      schedulePersistence()
    },

    async flush() {
      await persistenceQueue
    },
  }
}

export const inspectSharedDbIndexedDbSchema = async (
  options: SharedDbIndexedDbBackendOptions = {},
): Promise<Array<{ store: SharedDbBackendTableName; indexes: string[] }>> => {
  const factory = getIndexedDbFactory(options)
  const database = await openIndexedDb(
    factory,
    options.databaseName ?? DEFAULT_INDEXED_DB_NAME,
    options.version ?? DEFAULT_INDEXED_DB_VERSION,
  )

  try {
    return indexedDbTableConfigs.map((config) => {
      const transaction = database.transaction(config.table, "readonly")
      const store = transaction.objectStore(config.table)
      return {
        store: config.table,
        indexes: Array.from(store.indexNames).sort(),
      }
    })
  } finally {
    database.close()
  }
}
