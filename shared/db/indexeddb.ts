import { createEmptySharedDbData, normalizeSharedDbData, sharedDbRequiredBackendIndexes } from "./backend.ts"
import type { SharedDbBackend, SharedDbBackendTableName, SharedDbEntanglementFamilyRows, SharedDbMetaRows, SharedDbWimpRows } from "./backend.t.ts"
import type {
  SharedDbData,
  SharedDbEntanglementFieldMemberRecord,
  SharedDbEntanglementFieldRecord,
  SharedDbEntanglementMemberRecord,
  SharedDbEntanglementRecord,
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
] as const satisfies readonly SharedDbBackendTableName[]

const wimpStoreNames = [
  "wimps",
  "wimp_fields",
  "field_values",
  "field_sources",
  "wimp_states",
  "wimp_edges",
] as const satisfies readonly SharedDbBackendTableName[]

const entanglementStoreNames = [
  "entanglements",
  "entanglement_members",
  "entanglement_fields",
  "entanglement_field_members",
] as const satisfies readonly SharedDbBackendTableName[]

const cloneRow = <T>(row: T): T => structuredClone(row)
const cloneRows = <T>(rows: readonly T[]): T[] => rows.map(cloneRow)
const compareById = <T extends { id: string }>(left: T, right: T): number => left.id.localeCompare(right.id)
const sortRowsById = <T extends { id: string }>(rows: T[]): T[] => rows.sort(compareById)
const dedupeRowsById = <T extends { id: string }>(rows: readonly T[]): T[] =>
  Array.from(new Map(rows.map((row) => [row.id, cloneRow(row)] as const)).values())

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
  storeName: SharedDbBackendTableName,
  key: string,
): Promise<T | null> => {
  const transaction = database.transaction(storeName, "readonly")
  const request = transaction.objectStore(storeName).get(key)
  const [result] = await Promise.all([resolveRequest(request), completeTransaction(transaction)])
  return result === undefined ? null : cloneRow(result as T)
}

const readStoreRowByIndex = async <T>(
  database: IDBDatabase,
  storeName: SharedDbBackendTableName,
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
  storeName: SharedDbBackendTableName,
  indexName: string,
  key: string,
): Promise<T[]> => {
  const transaction = database.transaction(storeName, "readonly")
  const request = transaction.objectStore(storeName).index(indexName).getAll(key)
  const [result] = await Promise.all([resolveRequest(request), completeTransaction(transaction)])
  return sortRowsById(cloneRows((result ?? []) as T[]))
}

const readAllIndexedDbData = async (database: IDBDatabase): Promise<SharedDbData> => {
  const transaction = database.transaction(indexedDbTableNames, "readonly")
  const requests = new Map<keyof SharedDbData, IDBRequest<unknown[]>>()

  indexedDbTableConfigs.forEach((config) => {
    requests.set(config.dataKey, transaction.objectStore(config.table).getAll())
  })

  await completeTransaction(transaction)

  const data = createEmptySharedDbData()
  indexedDbTableConfigs.forEach((config) => {
    data[config.dataKey] = cloneRows((requests.get(config.dataKey)?.result ?? []) as SharedDbData[typeof config.dataKey])
  })

  return normalizeSharedDbData(data)
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

const readMetaRowsFromIndexedDb = async (database: IDBDatabase, metaId: string): Promise<SharedDbMetaRows | null> => {
  const meta = await readStoreRow<SharedDbMetaRecord>(database, "metas", metaId)
  if (!meta) return null

  const fields = await readStoreRowsByIndex<SharedDbMetaFieldRecord>(database, "meta_fields", "meta_fields_by_owner_meta", metaId)
  const states = await readStoreRowsByIndex<SharedDbMetaStateRecord>(database, "meta_states", "meta_states_by_owner_meta", metaId)
  const transitions = sortRowsById(
    (
      await Promise.all(
        states.map((state) =>
          readStoreRowsByIndex<SharedDbMetaTransitionRecord>(
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
          readStoreRowsByIndex<SharedDbMetaTransitionConditionRecord>(
            database,
            "meta_transition_conditions",
            "meta_transition_conditions_by_owner_transition",
            transition.id,
          ),
        ),
      )
    ).flat(),
  )
  const processes = await readStoreRowsByIndex<SharedDbMetaProcessRecord>(
    database,
    "meta_processes",
    "meta_processes_by_owner_meta",
    metaId,
  )
  const processReads = sortRowsById(
    (
      await Promise.all(
        processes.map((process) =>
          readStoreRowsByIndex<SharedDbMetaProcessReadRecord>(
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
          readStoreRowsByIndex<SharedDbMetaProcessWriteRecord>(
            database,
            "meta_process_writes",
            "meta_process_writes_by_owner_process",
            process.id,
          ),
        ),
      )
    ).flat(),
  )
  const reactions = await readStoreRowsByIndex<SharedDbMetaReactionRecord>(
    database,
    "meta_reactions",
    "meta_reactions_by_owner_meta",
    metaId,
  )
  const reactionStates = sortRowsById(
    (
      await Promise.all(
        reactions.map((reaction) =>
          readStoreRowsByIndex<SharedDbMetaReactionStateRecord>(
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
          readStoreRowsByIndex<SharedDbMetaReactionReadRecord>(
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
          readStoreRowsByIndex<SharedDbMetaReactionWriteRecord>(
            database,
            "meta_reaction_writes",
            "meta_reaction_writes_by_owner_reaction",
            reaction.id,
          ),
        ),
      )
    ).flat(),
  )
  const matterNodes = await readStoreRowsByIndex<SharedDbMetaMatterNodeRecord>(
    database,
    "meta_matter_nodes",
    "meta_matter_nodes_by_owner_meta",
    metaId,
  )
  const matterEdges = await readStoreRowsByIndex<SharedDbMetaMatterEdgeRecord>(
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

const readWimpRowsFromIndexedDb = async (database: IDBDatabase, wimpId: string): Promise<SharedDbWimpRows | null> => {
  const wimp = await readStoreRow<SharedDbWimpRecord>(database, "wimps", wimpId)
  if (!wimp) return null

  const fields = await readStoreRowsByIndex<SharedDbWimpFieldRecord>(database, "wimp_fields", "wimp_fields_by_owner_wimp", wimpId)
  const values = sortRowsById(
    (
      await Promise.all(
        fields.map((field) =>
          readStoreRowsByIndex<SharedDbFieldValueRecord>(
            database,
            "field_values",
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
          readStoreRowsByIndex<SharedDbFieldSourceRecord>(
            database,
            "field_sources",
            "field_sources_by_child_wimp_field",
            field.id,
          ),
        ),
      )
    ).flat(),
  )
  const state = await readStoreRowByIndex<SharedDbWimpStateRecord>(database, "wimp_states", "wimp_states_by_owner", wimpId)
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

const readEntanglementFamilyFromIndexedDb = async (
  database: IDBDatabase,
  entanglementId: string,
): Promise<SharedDbEntanglementFamilyRows | null> => {
  const entanglement = await readStoreRow<SharedDbEntanglementRecord>(database, "entanglements", entanglementId)
  if (!entanglement) return null

  const members = await readStoreRowsByIndex<SharedDbEntanglementMemberRecord>(
    database,
    "entanglement_members",
    "entanglement_members_by_owner_entanglement",
    entanglementId,
  )
  const fields = await readStoreRowsByIndex<SharedDbEntanglementFieldRecord>(
    database,
    "entanglement_fields",
    "entanglement_fields_by_owner_entanglement",
    entanglementId,
  )
  const field = fields[0]
  if (!field) {
    throw new Error(`Entanglement ${entanglementId} is missing entanglement_field rows`)
  }
  const fieldMembers = await readStoreRowsByIndex<SharedDbEntanglementFieldMemberRecord>(
    database,
    "entanglement_field_members",
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

const replaceMetaRowsInIndexedDb = async (database: IDBDatabase, rows: SharedDbMetaRows): Promise<void> => {
  const existingFields = await readStoreRowsByIndex<SharedDbMetaFieldRecord>(database, "meta_fields", "meta_fields_by_owner_meta", rows.meta.id)
  const existingStates = await readStoreRowsByIndex<SharedDbMetaStateRecord>(database, "meta_states", "meta_states_by_owner_meta", rows.meta.id)
  const existingTransitions = sortRowsById(
    (
      await Promise.all(
        existingStates.map((state) =>
          readStoreRowsByIndex<SharedDbMetaTransitionRecord>(
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
          readStoreRowsByIndex<SharedDbMetaTransitionConditionRecord>(
            database,
            "meta_transition_conditions",
            "meta_transition_conditions_by_owner_transition",
            transition.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingProcesses = await readStoreRowsByIndex<SharedDbMetaProcessRecord>(
    database,
    "meta_processes",
    "meta_processes_by_owner_meta",
    rows.meta.id,
  )
  const existingProcessReads = sortRowsById(
    (
      await Promise.all(
        existingProcesses.map((process) =>
          readStoreRowsByIndex<SharedDbMetaProcessReadRecord>(
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
          readStoreRowsByIndex<SharedDbMetaProcessWriteRecord>(
            database,
            "meta_process_writes",
            "meta_process_writes_by_owner_process",
            process.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingReactions = await readStoreRowsByIndex<SharedDbMetaReactionRecord>(
    database,
    "meta_reactions",
    "meta_reactions_by_owner_meta",
    rows.meta.id,
  )
  const existingReactionStates = sortRowsById(
    (
      await Promise.all(
        existingReactions.map((reaction) =>
          readStoreRowsByIndex<SharedDbMetaReactionStateRecord>(
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
          readStoreRowsByIndex<SharedDbMetaReactionReadRecord>(
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
          readStoreRowsByIndex<SharedDbMetaReactionWriteRecord>(
            database,
            "meta_reaction_writes",
            "meta_reaction_writes_by_owner_reaction",
            reaction.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingMatterNodes = await readStoreRowsByIndex<SharedDbMetaMatterNodeRecord>(
    database,
    "meta_matter_nodes",
    "meta_matter_nodes_by_owner_meta",
    rows.meta.id,
  )
  const existingMatterEdges = await readStoreRowsByIndex<SharedDbMetaMatterEdgeRecord>(
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

const replaceWimpRowsInIndexedDb = async (database: IDBDatabase, rows: SharedDbWimpRows): Promise<void> => {
  const existingFields = await readStoreRowsByIndex<SharedDbWimpFieldRecord>(database, "wimp_fields", "wimp_fields_by_owner_wimp", rows.wimp.id)
  const existingValues = sortRowsById(
    (
      await Promise.all(
        existingFields.map((field) =>
          readStoreRowsByIndex<SharedDbFieldValueRecord>(
            database,
            "field_values",
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
          readStoreRowsByIndex<SharedDbFieldSourceRecord>(
            database,
            "field_sources",
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
          readStoreRowsByIndex<SharedDbFieldSourceRecord>(
            database,
            "field_sources",
            "field_sources_by_parent_wimp_field",
            field.id,
          ),
        ),
      )
    ).flat(),
  )
  const existingSources = dedupeRowsById([...existingChildSources, ...existingParentSources])
  const existingState = await readStoreRowByIndex<SharedDbWimpStateRecord>(database, "wimp_states", "wimp_states_by_owner", rows.wimp.id)

  const transaction = database.transaction(wimpStoreNames, "readwrite")

  deleteRowsById(transaction.objectStore("field_sources"), existingSources)
  deleteRowsById(transaction.objectStore("field_values"), existingValues)
  deleteRowsById(transaction.objectStore("wimp_fields"), existingFields)
  if (existingState) {
    transaction.objectStore("wimp_states").delete(existingState.id)
  }

  putRow(transaction.objectStore("wimps"), rows.wimp)
  putRows(transaction.objectStore("wimp_fields"), rows.fields)
  putRows(transaction.objectStore("field_values"), rows.values)
  putRows(transaction.objectStore("field_sources"), rows.sources)
  putRow(transaction.objectStore("wimp_states"), rows.state)

  await completeTransaction(transaction)
}

const replaceWimpEdgeInIndexedDb = async (database: IDBDatabase, row: SharedDbWimpEdgeRecord): Promise<void> => {
  const existing = await readStoreRowByIndex<SharedDbWimpEdgeRecord>(database, "wimp_edges", "wimp_edges_by_child", row.childWimpId)
  const transaction = database.transaction("wimp_edges", "readwrite")
  const store = transaction.objectStore("wimp_edges")

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
  entanglement: SharedDbEntanglementRecord | null
  members: SharedDbEntanglementMemberRecord[]
  fields: SharedDbEntanglementFieldRecord[]
  fieldMembers: SharedDbEntanglementFieldMemberRecord[]
}> => {
  const entanglement = await readStoreRow<SharedDbEntanglementRecord>(database, "entanglements", entanglementId)
  const members = await readStoreRowsByIndex<SharedDbEntanglementMemberRecord>(
    database,
    "entanglement_members",
    "entanglement_members_by_owner_entanglement",
    entanglementId,
  )
  const fields = await readStoreRowsByIndex<SharedDbEntanglementFieldRecord>(
    database,
    "entanglement_fields",
    "entanglement_fields_by_owner_entanglement",
    entanglementId,
  )
  const fieldMembers = sortRowsById(
    (
      await Promise.all(
        fields.map((field) =>
          readStoreRowsByIndex<SharedDbEntanglementFieldMemberRecord>(
            database,
            "entanglement_field_members",
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

  deleteRowsById(transaction.objectStore("entanglement_field_members"), existing.fieldMembers)
  deleteRowsById(transaction.objectStore("entanglement_fields"), existing.fields)
  deleteRowsById(transaction.objectStore("entanglement_members"), existing.members)
  if (existing.entanglement) {
    transaction.objectStore("entanglements").delete(existing.entanglement.id)
  }

  await completeTransaction(transaction)
}

const replaceEntanglementFamilyInIndexedDb = async (
  database: IDBDatabase,
  rows: SharedDbEntanglementFamilyRows,
): Promise<void> => {
  const existing = await readExistingEntanglementFamily(database, rows.entanglement.id)
  const transaction = database.transaction(entanglementStoreNames, "readwrite")

  deleteRowsById(transaction.objectStore("entanglement_field_members"), existing.fieldMembers)
  deleteRowsById(transaction.objectStore("entanglement_fields"), existing.fields)
  deleteRowsById(transaction.objectStore("entanglement_members"), existing.members)
  if (existing.entanglement) {
    transaction.objectStore("entanglements").delete(existing.entanglement.id)
  }

  putRow(transaction.objectStore("entanglements"), rows.entanglement)
  putRows(transaction.objectStore("entanglement_members"), rows.members)
  putRow(transaction.objectStore("entanglement_fields"), rows.field)
  putRows(transaction.objectStore("entanglement_field_members"), rows.fieldMembers)

  await completeTransaction(transaction)
}

const setFieldValueInIndexedDb = async (database: IDBDatabase, wimpFieldId: string, value: unknown): Promise<void> => {
  const existing = await readStoreRowByIndex<SharedDbFieldValueRecord>(
    database,
    "field_values",
    "field_values_by_owner_wimp_field",
    wimpFieldId,
  )
  if (!existing) {
    throw new Error(`Field value not found for wimp field ${wimpFieldId}`)
  }

  const transaction = database.transaction("field_values", "readwrite")
  putRow(transaction.objectStore("field_values"), {
    ...existing,
    value: structuredClone(value),
  })
  await completeTransaction(transaction)
}

const setWimpStateInIndexedDb = async (database: IDBDatabase, wimpId: string, metaStateId: string): Promise<void> => {
  const existing = await readStoreRowByIndex<SharedDbWimpStateRecord>(database, "wimp_states", "wimp_states_by_owner", wimpId)
  if (!existing) {
    throw new Error(`Wimp state not found for wimp ${wimpId}`)
  }

  const transaction = database.transaction("wimp_states", "readwrite")
  putRow(transaction.objectStore("wimp_states"), {
    ...existing,
    metaStateId,
  })
  await completeTransaction(transaction)
}

const readFullDumpSnapshotFromIndexedDb = async (database: IDBDatabase): Promise<SharedDbData> =>
  await readAllIndexedDbData(database)

export const openSharedDbIndexedDbBackend = async (
  options: SharedDbIndexedDbBackendOptions = {},
): Promise<SharedDbIndexedDbBackend> => {
  const factory = getIndexedDbFactory(options)
  const database = await openIndexedDb(
    factory,
    options.databaseName ?? DEFAULT_INDEXED_DB_NAME,
    options.version ?? DEFAULT_INDEXED_DB_VERSION,
  )

  /**
   * Full dump snapshot для sync `readData()`.
   *
   * Это не mutable mirror row-cache: snapshot каждый раз перечитывается
   * из уже persisted IndexedDB state после успешной write-операции.
   */
  let fullDumpSnapshot = await readFullDumpSnapshotFromIndexedDb(database)
  let pendingWriteQueue = Promise.resolve()
  let closed = false

  const assertOpen = (): void => {
    if (closed) {
      throw new Error("IndexedDB backend is closed")
    }
  }

  const refreshFullDumpSnapshot = async (): Promise<void> => {
    fullDumpSnapshot = await readFullDumpSnapshotFromIndexedDb(database)
  }

  const enqueueWrite = (operation: () => Promise<void>): Promise<void> => {
    assertOpen()
    const writePromise = pendingWriteQueue.then(async () => {
      await operation()
      await refreshFullDumpSnapshot()
    })
    pendingWriteQueue = writePromise.then(() => undefined, () => undefined)
    return writePromise
  }

  return {
    requiredIndexes: sharedDbRequiredBackendIndexes,

    close() {
      if (closed) return
      closed = true
      void pendingWriteQueue.finally(() => {
        database.close()
      })
    },

    reset() {
      return enqueueWrite(async () => {
        const transaction = database.transaction(indexedDbTableNames, "readwrite")
        indexedDbTableNames.forEach((table) => {
          transaction.objectStore(table).clear()
        })
        await completeTransaction(transaction)
      })
    },

    async flush() {
      await pendingWriteQueue
    },

    readData() {
      assertOpen()
      return normalizeSharedDbData(fullDumpSnapshot)
    },

    async readMetaRows(metaId) {
      assertOpen()
      await pendingWriteQueue
      return readMetaRowsFromIndexedDb(database, metaId)
    },

    async readWimpRows(wimpId) {
      assertOpen()
      await pendingWriteQueue
      return readWimpRowsFromIndexedDb(database, wimpId)
    },

    async readWimpEdge(childWimpId) {
      assertOpen()
      await pendingWriteQueue
      return readStoreRowByIndex<SharedDbWimpEdgeRecord>(database, "wimp_edges", "wimp_edges_by_child", childWimpId)
    },

    async readFieldValue(wimpFieldId) {
      assertOpen()
      await pendingWriteQueue
      return readStoreRowByIndex<SharedDbFieldValueRecord>(
        database,
        "field_values",
        "field_values_by_owner_wimp_field",
        wimpFieldId,
      )
    },

    async readFieldSource(childWimpFieldId) {
      assertOpen()
      await pendingWriteQueue
      return readStoreRowByIndex<SharedDbFieldSourceRecord>(
        database,
        "field_sources",
        "field_sources_by_child_wimp_field",
        childWimpFieldId,
      )
    },

    async readEntanglementFamily(entanglementId) {
      assertOpen()
      await pendingWriteQueue
      return readEntanglementFamilyFromIndexedDb(database, entanglementId)
    },

    writeMetaRows(rows) {
      return enqueueWrite(async () => {
        await replaceMetaRowsInIndexedDb(database, rows)
      })
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
