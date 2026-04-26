import { createIdbDbViewBackend, inspectDbViewIndexedDbSchema } from "../view/idb/store.ts"
import { dbRequiredBackendIndexes } from "./backend.ts"
import type { DbBackend, DbBackendTableName, DbMetaRows } from "./backend.t.ts"
import type {
  DbMetaFieldRecord,
  DbMetaMatterEdgeRecord,
  DbMetaMatterNodeRecord,
  DbMetaProcessReadRecord,
  DbMetaProcessRecord,
  DbMetaProcessWriteRecord,
  DbMetaReactionReadRecord,
  DbMetaReactionRecord,
  DbMetaReactionStateRecord,
  DbMetaReactionWriteRecord,
  DbMetaRecord,
  DbMetaStateRecord,
  DbMetaTransitionConditionRecord,
  DbMetaTransitionRecord,
} from "./db.t.ts"

export interface DbIndexedDbBackendOptions {
  databaseName?: string
  version?: number
  indexedDb?: IDBFactory
}

export interface DbIndexedDbBackend extends DbBackend {
  flush(): Promise<void>
}

const DEFAULT_INDEXED_DB_NAME = "metafor-db"
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
  { table: "view_wimps", dataKey: "view_wimps" },
  { table: "view_wimp_fields", dataKey: "wimpFields" },
  { table: "view_wimp_edges", dataKey: "wimpEdges" },
  { table: "view_field_values", dataKey: "fieldValues" },
  { table: "view_field_sources", dataKey: "fieldSources" },
  { table: "view_wimp_states", dataKey: "wimpStates" },
  { table: "view_entanglements", dataKey: "view_entanglements" },
  { table: "view_entanglement_members", dataKey: "entanglementMembers" },
  { table: "view_entanglement_fields", dataKey: "entanglementFields" },
  { table: "view_entanglement_field_members", dataKey: "entanglementFieldMembers" },
] as const satisfies ReadonlyArray<{ table: DbBackendTableName; dataKey: string }>

const indexedDbTableNames = indexedDbTableConfigs.map((config) => config.table)

const metaStoreNames = [
  "metas",
  "meta_fields",
  "meta_states",
  "meta_transitions",
  "meta_transition_conditions",
  "meta_processes",
  "meta_process_reads",
  "meta_process_writes",
  "meta_reactions",
  "meta_reaction_states",
  "meta_reaction_reads",
  "meta_reaction_writes",
  "meta_matter_nodes",
  "meta_matter_edges",
] as const satisfies readonly DbBackendTableName[]

const cloneRow = <T>(row: T): T => structuredClone(row)
const cloneRows = <T>(rows: readonly T[]): T[] => rows.map(cloneRow)
const compareById = <T extends { id: string }>(left: T, right: T): number => left.id.localeCompare(right.id)
const sortRowsById = <T extends { id: string }>(rows: T[]): T[] => rows.sort(compareById)

const getIndexedDbFactory = (options: DbIndexedDbBackendOptions): IDBFactory => {
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

        dbRequiredBackendIndexes
          .filter((index) => index.table === config.table)
          .forEach((index) => {
            if (store.indexNames.contains(index.name)) return
            const keyPath = index.columns.length === 1 ? index.columns[0]! : [...index.columns]
            store.createIndex(index.name, keyPath, {
              unique: index.unique,
            })
          })
      })
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error(`Failed to open IndexedDB database ${databaseName}`))
  })

const resolveRequest = async <T>(request: IDBRequest<T>): Promise<T> =>
  await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"))
  })

const completeTransaction = async (transaction: IDBTransaction): Promise<void> =>
  await new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"))
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"))
  })

const readStoreRow = async <T>(
  database: IDBDatabase,
  storeName: DbBackendTableName,
  key: string,
): Promise<T | null> => {
  const transaction = database.transaction(storeName, "readonly")
  const request = transaction.objectStore(storeName).get(key)
  const [result] = await Promise.all([resolveRequest(request), completeTransaction(transaction)])
  return result === undefined ? null : cloneRow(result as T)
}

const readStoreRowsByIndex = async <T extends { id: string }>(
  database: IDBDatabase,
  storeName: DbBackendTableName,
  indexName: string,
  key: string,
): Promise<T[]> => {
  const transaction = database.transaction(storeName, "readonly")
  const request = transaction.objectStore(storeName).index(indexName).getAll(key)
  const [result] = await Promise.all([resolveRequest(request), completeTransaction(transaction)])
  return sortRowsById(cloneRows((result ?? []) as T[]))
}

const putRow = <T>(store: IDBObjectStore, row: T): void => {
  store.put(cloneRow(row))
}

const putRows = <T>(store: IDBObjectStore, rows: readonly T[]): void => {
  rows.forEach((row) => {
    store.put(cloneRow(row))
  })
}

const deleteRowsById = <T extends { id: string }>(store: IDBObjectStore, rows: readonly T[]): void => {
  rows.forEach((row) => {
    store.delete(row.id)
  })
}

const readMetaRowsFromIndexedDb = async (database: IDBDatabase, metaId: string): Promise<DbMetaRows | null> => {
  const meta = await readStoreRow<DbMetaRecord>(database, "metas", metaId)
  if (!meta) return null

  const fields = await readStoreRowsByIndex<DbMetaFieldRecord>(database, "meta_fields", "meta_fields_by_owner_meta", metaId)
  const states = await readStoreRowsByIndex<DbMetaStateRecord>(database, "meta_states", "meta_states_by_owner_meta", metaId)
  const transitions = sortRowsById(
    (
      await Promise.all(
        states.map((state) =>
          readStoreRowsByIndex<DbMetaTransitionRecord>(
            database,
            "meta_transitions",
            "meta_transitions_by_owner_state",
            state.id,
          ),
        ),
      )
    ).flat(),
  )
  const transitionConditions = sortRowsById(
    (
      await Promise.all(
        transitions.map((transition) =>
          readStoreRowsByIndex<DbMetaTransitionConditionRecord>(
            database,
            "meta_transition_conditions",
            "meta_transition_conditions_by_owner_transition",
            transition.id,
          ),
        ),
      )
    ).flat(),
  )
  const processes = await readStoreRowsByIndex<DbMetaProcessRecord>(
    database,
    "meta_processes",
    "meta_processes_by_owner_meta",
    metaId,
  )
  const processReads = sortRowsById(
    (
      await Promise.all(
        processes.map((process) =>
          readStoreRowsByIndex<DbMetaProcessReadRecord>(
            database,
            "meta_process_reads",
            "meta_process_reads_by_owner_process",
            process.id,
          ),
        ),
      )
    ).flat(),
  )
  const processWrites = sortRowsById(
    (
      await Promise.all(
        processes.map((process) =>
          readStoreRowsByIndex<DbMetaProcessWriteRecord>(
            database,
            "meta_process_writes",
            "meta_process_writes_by_owner_process",
            process.id,
          ),
        ),
      )
    ).flat(),
  )
  const reactions = await readStoreRowsByIndex<DbMetaReactionRecord>(
    database,
    "meta_reactions",
    "meta_reactions_by_owner_meta",
    metaId,
  )
  const reactionStates = sortRowsById(
    (
      await Promise.all(
        reactions.map((reaction) =>
          readStoreRowsByIndex<DbMetaReactionStateRecord>(
            database,
            "meta_reaction_states",
            "meta_reaction_states_by_owner_reaction",
            reaction.id,
          ),
        ),
      )
    ).flat(),
  )
  const reactionReads = sortRowsById(
    (
      await Promise.all(
        reactions.map((reaction) =>
          readStoreRowsByIndex<DbMetaReactionReadRecord>(
            database,
            "meta_reaction_reads",
            "meta_reaction_reads_by_owner_reaction",
            reaction.id,
          ),
        ),
      )
    ).flat(),
  )
  const reactionWrites = sortRowsById(
    (
      await Promise.all(
        reactions.map((reaction) =>
          readStoreRowsByIndex<DbMetaReactionWriteRecord>(
            database,
            "meta_reaction_writes",
            "meta_reaction_writes_by_owner_reaction",
            reaction.id,
          ),
        ),
      )
    ).flat(),
  )
  const matterNodes = await readStoreRowsByIndex<DbMetaMatterNodeRecord>(
    database,
    "meta_matter_nodes",
    "meta_matter_nodes_by_owner_meta",
    metaId,
  )
  const matterEdges = await readStoreRowsByIndex<DbMetaMatterEdgeRecord>(
    database,
    "meta_matter_edges",
    "meta_matter_edges_by_owner_meta",
    metaId,
  )

  return {
    meta,
    fields,
    states,
    transitions,
    transitionConditions,
    processes,
    processReads,
    processWrites,
    reactions,
    reactionStates,
    reactionReads,
    reactionWrites,
    matterNodes,
    matterEdges,
  }
}

const replaceMetaRowsInIndexedDb = async (database: IDBDatabase, rows: DbMetaRows): Promise<void> => {
  const existingFields = await readStoreRowsByIndex<DbMetaFieldRecord>(database, "meta_fields", "meta_fields_by_owner_meta", rows.meta.id)
  const existingStates = await readStoreRowsByIndex<DbMetaStateRecord>(database, "meta_states", "meta_states_by_owner_meta", rows.meta.id)
  const existingTransitions = sortRowsById(
    (
      await Promise.all(
        existingStates.map((state) =>
          readStoreRowsByIndex<DbMetaTransitionRecord>(
            database,
            "meta_transitions",
            "meta_transitions_by_owner_state",
            state.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingTransitionConditions = sortRowsById(
    (
      await Promise.all(
        existingTransitions.map((transition) =>
          readStoreRowsByIndex<DbMetaTransitionConditionRecord>(
            database,
            "meta_transition_conditions",
            "meta_transition_conditions_by_owner_transition",
            transition.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingProcesses = await readStoreRowsByIndex<DbMetaProcessRecord>(
    database,
    "meta_processes",
    "meta_processes_by_owner_meta",
    rows.meta.id,
  )
  const existingProcessReads = sortRowsById(
    (
      await Promise.all(
        existingProcesses.map((process) =>
          readStoreRowsByIndex<DbMetaProcessReadRecord>(
            database,
            "meta_process_reads",
            "meta_process_reads_by_owner_process",
            process.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingProcessWrites = sortRowsById(
    (
      await Promise.all(
        existingProcesses.map((process) =>
          readStoreRowsByIndex<DbMetaProcessWriteRecord>(
            database,
            "meta_process_writes",
            "meta_process_writes_by_owner_process",
            process.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingReactions = await readStoreRowsByIndex<DbMetaReactionRecord>(
    database,
    "meta_reactions",
    "meta_reactions_by_owner_meta",
    rows.meta.id,
  )
  const existingReactionStates = sortRowsById(
    (
      await Promise.all(
        existingReactions.map((reaction) =>
          readStoreRowsByIndex<DbMetaReactionStateRecord>(
            database,
            "meta_reaction_states",
            "meta_reaction_states_by_owner_reaction",
            reaction.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingReactionReads = sortRowsById(
    (
      await Promise.all(
        existingReactions.map((reaction) =>
          readStoreRowsByIndex<DbMetaReactionReadRecord>(
            database,
            "meta_reaction_reads",
            "meta_reaction_reads_by_owner_reaction",
            reaction.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingReactionWrites = sortRowsById(
    (
      await Promise.all(
        existingReactions.map((reaction) =>
          readStoreRowsByIndex<DbMetaReactionWriteRecord>(
            database,
            "meta_reaction_writes",
            "meta_reaction_writes_by_owner_reaction",
            reaction.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingMatterNodes = await readStoreRowsByIndex<DbMetaMatterNodeRecord>(
    database,
    "meta_matter_nodes",
    "meta_matter_nodes_by_owner_meta",
    rows.meta.id,
  )
  const existingMatterEdges = await readStoreRowsByIndex<DbMetaMatterEdgeRecord>(
    database,
    "meta_matter_edges",
    "meta_matter_edges_by_owner_meta",
    rows.meta.id,
  )

  const transaction = database.transaction(metaStoreNames, "readwrite")

  deleteRowsById(transaction.objectStore("meta_transition_conditions"), existingTransitionConditions)
  deleteRowsById(transaction.objectStore("meta_transitions"), existingTransitions)
  deleteRowsById(transaction.objectStore("meta_states"), existingStates)
  deleteRowsById(transaction.objectStore("meta_fields"), existingFields)
  deleteRowsById(transaction.objectStore("meta_process_reads"), existingProcessReads)
  deleteRowsById(transaction.objectStore("meta_process_writes"), existingProcessWrites)
  deleteRowsById(transaction.objectStore("meta_processes"), existingProcesses)
  deleteRowsById(transaction.objectStore("meta_reaction_states"), existingReactionStates)
  deleteRowsById(transaction.objectStore("meta_reaction_reads"), existingReactionReads)
  deleteRowsById(transaction.objectStore("meta_reaction_writes"), existingReactionWrites)
  deleteRowsById(transaction.objectStore("meta_reactions"), existingReactions)
  deleteRowsById(transaction.objectStore("meta_matter_edges"), existingMatterEdges)
  deleteRowsById(transaction.objectStore("meta_matter_nodes"), existingMatterNodes)

  putRow(transaction.objectStore("metas"), rows.meta)
  putRows(transaction.objectStore("meta_fields"), rows.fields)
  putRows(transaction.objectStore("meta_states"), rows.states)
  putRows(transaction.objectStore("meta_transitions"), rows.transitions)
  putRows(transaction.objectStore("meta_transition_conditions"), rows.transitionConditions)
  putRows(transaction.objectStore("meta_processes"), rows.processes)
  putRows(transaction.objectStore("meta_process_reads"), rows.processReads)
  putRows(transaction.objectStore("meta_process_writes"), rows.processWrites)
  putRows(transaction.objectStore("meta_reactions"), rows.reactions)
  putRows(transaction.objectStore("meta_reaction_states"), rows.reactionStates)
  putRows(transaction.objectStore("meta_reaction_reads"), rows.reactionReads)
  putRows(transaction.objectStore("meta_reaction_writes"), rows.reactionWrites)
  putRows(transaction.objectStore("meta_matter_nodes"), rows.matterNodes)
  putRows(transaction.objectStore("meta_matter_edges"), rows.matterEdges)

  await completeTransaction(transaction)
}

export const openDbIndexedDbBackend = async (
  options: DbIndexedDbBackendOptions = {},
): Promise<DbIndexedDbBackend> => {
  const factory = getIndexedDbFactory(options)
  const databaseName = options.databaseName ?? DEFAULT_INDEXED_DB_NAME
  const version = options.version ?? DEFAULT_INDEXED_DB_VERSION

  // Открываем единый IDBDatabase, в котором живут как meta-store-ы, так и view-store-ы.
  const database = await openIndexedDb(factory, databaseName, version)

  // ViewBackend разделяет тот же IDBDatabase. Здесь он просто открывает его повторно
  // через свой набор tableConfigs — поскольку upgrade уже выполнен openIndexedDb, view-stores
  // уже созданы, и openIndexedDbViewBackend их найдёт.
  const viewBackend = await createIdbDbViewBackend({ databaseName, version, indexedDb: factory })

  let pendingWriteQueue = Promise.resolve()
  let closed = false

  const assertOpen = (): void => {
    if (closed) {
      throw new Error("IndexedDB backend is closed")
    }
  }

  const enqueueWrite = (operation: () => Promise<void>): Promise<void> => {
    assertOpen()
    const writePromise = pendingWriteQueue.then(async () => {
      await operation()
    })
    pendingWriteQueue = writePromise.then(() => undefined, () => undefined)
    return writePromise
  }

  return {
    requiredIndexes: dbRequiredBackendIndexes,

    close() {
      if (closed) return
      closed = true
      pendingWriteQueue.finally(() => {
        viewBackend.close()
        database.close()
      })
    },

    reset() {
      return enqueueWrite(async () => {
        // Очищаем view-таблицы через viewBackend (они в его собственных object-store-ах,
        // но физически живут в той же IDBDatabase — поэтому corruption не возникнет).
        await viewBackend.reset()
        const transaction = database.transaction(metaStoreNames, "readwrite")
        metaStoreNames.forEach((table) => {
          transaction.objectStore(table).clear()
        })
        await completeTransaction(transaction)
      })
    },

    async flush() {
      await pendingWriteQueue
      await viewBackend.flush()
    },

    async readMetaRows(metaId) {
      assertOpen()
      await pendingWriteQueue
      return readMetaRowsFromIndexedDb(database, metaId)
    },

    listWimpIds() {
      assertOpen()
      return viewBackend.listWimpIds()
    },

    readWimpRows(wimpId) {
      assertOpen()
      return viewBackend.readWimpRows(wimpId)
    },

    readWimpField(wimpFieldId) {
      assertOpen()
      return viewBackend.readWimpField(wimpFieldId)
    },

    readWimpEdge(childWimpId) {
      assertOpen()
      return viewBackend.readWimpEdge(childWimpId)
    },

    readFieldValue(wimpFieldId) {
      assertOpen()
      return viewBackend.readFieldValue(wimpFieldId)
    },

    readFieldSource(childWimpFieldId) {
      assertOpen()
      return viewBackend.readFieldSource(childWimpFieldId)
    },

    readEntanglementFamily(entanglementId) {
      assertOpen()
      return viewBackend.readEntanglementFamily(entanglementId)
    },

    writeMetaRows(rows) {
      return enqueueWrite(async () => {
        await replaceMetaRowsInIndexedDb(database, rows)
      })
    },

    writeWimpRows(rows) {
      assertOpen()
      return viewBackend.writeWimpRows(rows)
    },

    writeWimpEdge(row) {
      assertOpen()
      return viewBackend.writeWimpEdge(row)
    },

    deleteEntanglementFamily(entanglementId) {
      assertOpen()
      return viewBackend.deleteEntanglementFamily(entanglementId)
    },

    writeEntanglementFamily(rows) {
      assertOpen()
      return viewBackend.writeEntanglementFamily(rows)
    },

    setFieldValue(wimpFieldId, value) {
      assertOpen()
      return viewBackend.setFieldValue(wimpFieldId, value)
    },

    setWimpState(wimpId, metaStateId) {
      assertOpen()
      return viewBackend.setWimpState(wimpId, metaStateId)
    },
  }
}

export const inspectDbIndexedDbSchema = async (
  options: DbIndexedDbBackendOptions = {},
): Promise<Array<{ store: DbBackendTableName; indexes: string[] }>> => {
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
