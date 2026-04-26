import type { MetaforStore } from "./index.t"

export interface OpenBrowserStoreOptions {
  databaseName?: string
  metaDatabaseName?: string
  actorDatabaseName?: string
  viewDatabaseName?: string
  version?: number
  actorVersion?: number
  indexedDb?: IDBFactory
}

export type BrowserMetaforStore = MetaforStore
