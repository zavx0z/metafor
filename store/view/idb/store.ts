import {
  dbViewRequiredBackendIndexes,
  type DbViewBackend,
  type DbViewBackendTableName,
} from "../backend.t.ts"
import type {
  DbEntanglementFamilyRows,
  DbEntanglementFieldMemberRecord,
  DbEntanglementFieldRecord,
  DbEntanglementMemberRecord,
  DbEntanglementRecord,
  DbFieldSourceRecord,
  DbFieldValueRecord,
  DbWimpEdgeRecord,
  DbWimpFieldRecord,
  DbWimpRecord,
  DbWimpRows,
  DbWimpStateRecord,
} from "../types.t.ts"

export interface DbIndexedDbViewBackendOptions {
  databaseName?: string
  version?: number
  indexedDb?: IDBFactory
}

export interface DbIndexedDbViewBackend extends DbViewBackend {
  flush(): Promise<void>
}

const DEFAULT_VIEW_INDEXED_DB_NAME = "metafor-db-view"
const DEFAULT_VIEW_INDEXED_DB_VERSION = 1

const indexedDbViewTableConfigs = [
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
] as const satisfies ReadonlyArray<{ table: DbViewBackendTableName; dataKey: string }>

const indexedDbViewTableNames = indexedDbViewTableConfigs.map((config) => config.table)

const wimpStoreNames = [
  "view_wimps",
  "view_wimp_fields",
  "view_field_values",
  "view_field_sources",
  "view_wimp_states",
  "view_wimp_edges",
] as const satisfies readonly DbViewBackendTableName[]

const entanglementStoreNames = [
  "view_entanglements",
  "view_entanglement_members",
  "view_entanglement_fields",
  "view_entanglement_field_members",
] as const satisfies readonly DbViewBackendTableName[]

const cloneRow = <T>(row: T): T => structuredClone(row)
const cloneRows = <T>(rows: readonly T[]): T[] => rows.map(cloneRow)
const compareById = <T extends { id: string }>(left: T, right: T): number => left.id.localeCompare(right.id)
const sortRowsById = <T extends { id: string }>(rows: T[]): T[] => rows.sort(compareById)
const dedupeRowsById = <T extends { id: string }>(rows: readonly T[]): T[] =>
  Array.from(new Map(rows.map((row) => [row.id, cloneRow(row)] as const)).values())

const getIndexedDbFactory = (options: DbIndexedDbViewBackendOptions): IDBFactory => {
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

      indexedDbViewTableConfigs.forEach((config) => {
        const store = database.objectStoreNames.contains(config.table)
          ? request.transaction!.objectStore(config.table)
          : database.createObjectStore(config.table, { keyPath: "id" })

        dbViewRequiredBackendIndexes
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
  storeName: DbViewBackendTableName,
  key: string,
): Promise<T | null> => {
  const transaction = database.transaction(storeName, "readonly")
  const request = transaction.objectStore(storeName).get(key)
  const [result] = await Promise.all([resolveRequest(request), completeTransaction(transaction)])
  return result === undefined ? null : cloneRow(result as T)
}

const readStoreRowByIndex = async <T>(
  database: IDBDatabase,
  storeName: DbViewBackendTableName,
  indexName: string,
  key: string,
): Promise<T | null> => {
  const transaction = database.transaction(storeName, "readonly")
  const request = transaction.objectStore(storeName).index(indexName).getAll(key)
  const [result] = await Promise.all([resolveRequest(request), completeTransaction(transaction)])
  const row = (result as T[] | undefined)?.[0]
  return row === undefined ? null : cloneRow(row)
}

const readStoreRowsByIndex = async <T extends { id: string }>(
  database: IDBDatabase,
  storeName: DbViewBackendTableName,
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

const readWimpRowsFromIndexedDb = async (database: IDBDatabase, wimpId: string): Promise<DbWimpRows | null> => {
  const wimp = await readStoreRow<DbWimpRecord>(database, "view_wimps", wimpId)
  if (!wimp) return null

  const fields = await readStoreRowsByIndex<DbWimpFieldRecord>(database, "view_wimp_fields", "wimp_fields_by_owner_wimp", wimpId)
  const values = sortRowsById(
    (
      await Promise.all(
        fields.map((field) =>
          readStoreRowsByIndex<DbFieldValueRecord>(
            database,
            "view_field_values",
            "field_values_by_owner_wimp_field",
            field.id,
          ),
        ),
      )
    ).flat(),
  )
  const sources = sortRowsById(
    (
      await Promise.all(
        fields.map((field) =>
          readStoreRowsByIndex<DbFieldSourceRecord>(
            database,
            "view_field_sources",
            "field_sources_by_child_wimp_field",
            field.id,
          ),
        ),
      )
    ).flat(),
  )
  const state = await readStoreRowByIndex<DbWimpStateRecord>(database, "view_wimp_states", "wimp_states_by_owner", wimpId)
  if (!state) {
    throw new Error(`Wimp ${wimpId} is missing wimp_state row`)
  }

  return {
    wimp,
    fields,
    values,
    sources,
    state,
  }
}

const listWimpIdsFromIndexedDb = async (database: IDBDatabase): Promise<string[]> => {
  const transaction = database.transaction("view_wimps", "readonly")
  const request = transaction.objectStore("view_wimps").getAll()
  const [result] = await Promise.all([resolveRequest(request), completeTransaction(transaction)])
  return ((result ?? []) as DbWimpRecord[])
    .map(cloneRow)
    .sort((left, right) => left.wimpOrder - right.wimpOrder || left.id.localeCompare(right.id))
    .map((row) => row.id)
}

const readWimpFieldFromIndexedDb = async (
  database: IDBDatabase,
  wimpFieldId: string,
): Promise<DbWimpFieldRecord | null> => readStoreRow<DbWimpFieldRecord>(database, "view_wimp_fields", wimpFieldId)

const readEntanglementFamilyFromIndexedDb = async (
  database: IDBDatabase,
  entanglementId: string,
): Promise<DbEntanglementFamilyRows | null> => {
  const entanglement = await readStoreRow<DbEntanglementRecord>(database, "view_entanglements", entanglementId)
  if (!entanglement) return null

  const members = await readStoreRowsByIndex<DbEntanglementMemberRecord>(
    database,
    "view_entanglement_members",
    "entanglement_members_by_owner_entanglement",
    entanglementId,
  )
  const fields = await readStoreRowsByIndex<DbEntanglementFieldRecord>(
    database,
    "view_entanglement_fields",
    "entanglement_fields_by_owner_entanglement",
    entanglementId,
  )
  const field = fields[0]
  if (!field) {
    throw new Error(`Entanglement ${entanglementId} is missing entanglement_field rows`)
  }
  const fieldMembers = await readStoreRowsByIndex<DbEntanglementFieldMemberRecord>(
    database,
    "view_entanglement_field_members",
    "entanglement_field_members_by_owner_field",
    field.id,
  )

  return {
    entanglement,
    members,
    field,
    fieldMembers,
  }
}

const replaceWimpRowsInIndexedDb = async (database: IDBDatabase, rows: DbWimpRows): Promise<void> => {
  const existingFields = await readStoreRowsByIndex<DbWimpFieldRecord>(database, "view_wimp_fields", "wimp_fields_by_owner_wimp", rows.wimp.id)
  const existingValues = sortRowsById(
    (
      await Promise.all(
        existingFields.map((field) =>
          readStoreRowsByIndex<DbFieldValueRecord>(
            database,
            "view_field_values",
            "field_values_by_owner_wimp_field",
            field.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingChildSources = sortRowsById(
    (
      await Promise.all(
        existingFields.map((field) =>
          readStoreRowsByIndex<DbFieldSourceRecord>(
            database,
            "view_field_sources",
            "field_sources_by_child_wimp_field",
            field.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingParentSources = sortRowsById(
    (
      await Promise.all(
        existingFields.map((field) =>
          readStoreRowsByIndex<DbFieldSourceRecord>(
            database,
            "view_field_sources",
            "field_sources_by_parent_wimp_field",
            field.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingSources = dedupeRowsById([...existingChildSources, ...existingParentSources])
  const existingState = await readStoreRowByIndex<DbWimpStateRecord>(database, "view_wimp_states", "wimp_states_by_owner", rows.wimp.id)

  const transaction = database.transaction(wimpStoreNames, "readwrite")

  deleteRowsById(transaction.objectStore("view_field_sources"), existingSources)
  deleteRowsById(transaction.objectStore("view_field_values"), existingValues)
  deleteRowsById(transaction.objectStore("view_wimp_fields"), existingFields)
  if (existingState) {
    transaction.objectStore("view_wimp_states").delete(existingState.id)
  }

  putRow(transaction.objectStore("view_wimps"), rows.wimp)
  putRows(transaction.objectStore("view_wimp_fields"), rows.fields)
  putRows(transaction.objectStore("view_field_values"), rows.values)
  putRows(transaction.objectStore("view_field_sources"), rows.sources)
  putRow(transaction.objectStore("view_wimp_states"), rows.state)

  await completeTransaction(transaction)
}

const replaceWimpEdgeInIndexedDb = async (database: IDBDatabase, row: DbWimpEdgeRecord): Promise<void> => {
  const existing = await readStoreRowByIndex<DbWimpEdgeRecord>(database, "view_wimp_edges", "wimp_edges_by_child", row.childWimpId)
  const transaction = database.transaction("view_wimp_edges", "readwrite")
  const store = transaction.objectStore("view_wimp_edges")

  if (existing && existing.id !== row.id) {
    store.delete(existing.id)
  }

  putRow(store, row)
  await completeTransaction(transaction)
}

const readExistingEntanglementFamily = async (
  database: IDBDatabase,
  entanglementId: string,
): Promise<{
  entanglement: DbEntanglementRecord | null
  members: DbEntanglementMemberRecord[]
  fields: DbEntanglementFieldRecord[]
  fieldMembers: DbEntanglementFieldMemberRecord[]
}> => {
  const entanglement = await readStoreRow<DbEntanglementRecord>(database, "view_entanglements", entanglementId)
  const members = await readStoreRowsByIndex<DbEntanglementMemberRecord>(
    database,
    "view_entanglement_members",
    "entanglement_members_by_owner_entanglement",
    entanglementId,
  )
  const fields = await readStoreRowsByIndex<DbEntanglementFieldRecord>(
    database,
    "view_entanglement_fields",
    "entanglement_fields_by_owner_entanglement",
    entanglementId,
  )
  const fieldMembers = sortRowsById(
    (
      await Promise.all(
        fields.map((field) =>
          readStoreRowsByIndex<DbEntanglementFieldMemberRecord>(
            database,
            "view_entanglement_field_members",
            "entanglement_field_members_by_owner_field",
            field.id,
          ),
        ),
      )
    ).flat(),
  )

  return { entanglement, members, fields, fieldMembers }
}

const deleteEntanglementFamilyInIndexedDb = async (database: IDBDatabase, entanglementId: string): Promise<void> => {
  const existing = await readExistingEntanglementFamily(database, entanglementId)
  const transaction = database.transaction(entanglementStoreNames, "readwrite")

  deleteRowsById(transaction.objectStore("view_entanglement_field_members"), existing.fieldMembers)
  deleteRowsById(transaction.objectStore("view_entanglement_fields"), existing.fields)
  deleteRowsById(transaction.objectStore("view_entanglement_members"), existing.members)
  if (existing.entanglement) {
    transaction.objectStore("view_entanglements").delete(existing.entanglement.id)
  }

  await completeTransaction(transaction)
}

const replaceEntanglementFamilyInIndexedDb = async (
  database: IDBDatabase,
  rows: DbEntanglementFamilyRows,
): Promise<void> => {
  const existing = await readExistingEntanglementFamily(database, rows.entanglement.id)
  const transaction = database.transaction(entanglementStoreNames, "readwrite")

  deleteRowsById(transaction.objectStore("view_entanglement_field_members"), existing.fieldMembers)
  deleteRowsById(transaction.objectStore("view_entanglement_fields"), existing.fields)
  deleteRowsById(transaction.objectStore("view_entanglement_members"), existing.members)
  if (existing.entanglement) {
    transaction.objectStore("view_entanglements").delete(existing.entanglement.id)
  }

  putRow(transaction.objectStore("view_entanglements"), rows.entanglement)
  putRows(transaction.objectStore("view_entanglement_members"), rows.members)
  putRow(transaction.objectStore("view_entanglement_fields"), rows.field)
  putRows(transaction.objectStore("view_entanglement_field_members"), rows.fieldMembers)

  await completeTransaction(transaction)
}

const setFieldValueInIndexedDb = async (database: IDBDatabase, wimpFieldId: string, value: unknown): Promise<void> => {
  const existing = await readStoreRowByIndex<DbFieldValueRecord>(
    database,
    "view_field_values",
    "field_values_by_owner_wimp_field",
    wimpFieldId,
  )
  if (!existing) {
    throw new Error(`Field value not found for wimp field ${wimpFieldId}`)
  }

  const transaction = database.transaction("view_field_values", "readwrite")
  putRow(transaction.objectStore("view_field_values"), {
    ...existing,
    value: structuredClone(value),
  })
  await completeTransaction(transaction)
}

const setWimpStateInIndexedDb = async (database: IDBDatabase, wimpId: string, metaStateId: string): Promise<void> => {
  const existing = await readStoreRowByIndex<DbWimpStateRecord>(database, "view_wimp_states", "wimp_states_by_owner", wimpId)
  if (!existing) {
    throw new Error(`Wimp state not found for wimp ${wimpId}`)
  }

  const transaction = database.transaction("view_wimp_states", "readwrite")
  putRow(transaction.objectStore("view_wimp_states"), {
    ...existing,
    metaStateId,
  })
  await completeTransaction(transaction)
}

export const createIdbDbViewBackend = async (
  options: DbIndexedDbViewBackendOptions = {},
): Promise<DbIndexedDbViewBackend> => {
  const factory = getIndexedDbFactory(options)
  const database = await openIndexedDb(
    factory,
    options.databaseName ?? DEFAULT_VIEW_INDEXED_DB_NAME,
    options.version ?? DEFAULT_VIEW_INDEXED_DB_VERSION,
  )

  let pendingWriteQueue = Promise.resolve()
  let closed = false

  const assertOpen = (): void => {
    if (closed) {
      throw new Error("IndexedDB view backend is closed")
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
    requiredIndexes: dbViewRequiredBackendIndexes,

    close() {
      if (closed) return
      closed = true
      pendingWriteQueue.finally(() => {
        database.close()
      })
    },

    reset() {
      return enqueueWrite(async () => {
        const transaction = database.transaction(indexedDbViewTableNames, "readwrite")
        indexedDbViewTableNames.forEach((table) => {
          transaction.objectStore(table).clear()
        })
        await completeTransaction(transaction)
      })
    },

    async flush() {
      await pendingWriteQueue
    },

    async listWimpIds() {
      assertOpen()
      await pendingWriteQueue
      return listWimpIdsFromIndexedDb(database)
    },

    async readWimpRows(wimpId) {
      assertOpen()
      await pendingWriteQueue
      return readWimpRowsFromIndexedDb(database, wimpId)
    },

    async readWimpField(wimpFieldId) {
      assertOpen()
      await pendingWriteQueue
      return readWimpFieldFromIndexedDb(database, wimpFieldId)
    },

    async readWimpEdge(childWimpId) {
      assertOpen()
      await pendingWriteQueue
      return readStoreRowByIndex<DbWimpEdgeRecord>(database, "view_wimp_edges", "wimp_edges_by_child", childWimpId)
    },

    async readFieldValue(wimpFieldId) {
      assertOpen()
      await pendingWriteQueue
      return readStoreRowByIndex<DbFieldValueRecord>(
        database,
        "view_field_values",
        "field_values_by_owner_wimp_field",
        wimpFieldId,
      )
    },

    async readFieldSource(childWimpFieldId) {
      assertOpen()
      await pendingWriteQueue
      return readStoreRowByIndex<DbFieldSourceRecord>(
        database,
        "view_field_sources",
        "field_sources_by_child_wimp_field",
        childWimpFieldId,
      )
    },

    async readEntanglementFamily(entanglementId) {
      assertOpen()
      await pendingWriteQueue
      return readEntanglementFamilyFromIndexedDb(database, entanglementId)
    },

    writeWimpRows(rows) {
      return enqueueWrite(async () => {
        await replaceWimpRowsInIndexedDb(database, rows)
      })
    },

    writeWimpEdge(row) {
      return enqueueWrite(async () => {
        await replaceWimpEdgeInIndexedDb(database, row)
      })
    },

    deleteEntanglementFamily(entanglementId) {
      return enqueueWrite(async () => {
        await deleteEntanglementFamilyInIndexedDb(database, entanglementId)
      })
    },

    writeEntanglementFamily(rows) {
      return enqueueWrite(async () => {
        await replaceEntanglementFamilyInIndexedDb(database, rows)
      })
    },

    setFieldValue(wimpFieldId, value) {
      return enqueueWrite(async () => {
        await setFieldValueInIndexedDb(database, wimpFieldId, value)
      })
    },

    setWimpState(wimpId, metaStateId) {
      return enqueueWrite(async () => {
        await setWimpStateInIndexedDb(database, wimpId, metaStateId)
      })
    },
  }
}

export const inspectDbViewIndexedDbSchema = async (
  options: DbIndexedDbViewBackendOptions = {},
): Promise<Array<{ store: DbViewBackendTableName; indexes: string[] }>> => {
  const factory = getIndexedDbFactory(options)
  const database = await openIndexedDb(
    factory,
    options.databaseName ?? DEFAULT_VIEW_INDEXED_DB_NAME,
    options.version ?? DEFAULT_VIEW_INDEXED_DB_VERSION,
  )

  try {
    return indexedDbViewTableConfigs.map((config) => {
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
