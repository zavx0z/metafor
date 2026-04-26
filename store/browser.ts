import {
  createIdbDbActorStore,
  openDbIndexedDbBackend,
  type DbIndexedDbBackendOptions,
  type IdbDbActorStoreOptions,
} from "@metafor/db/browser"
import { createMetaforStore } from "./index.ts"
import type { BrowserMetaforStore, OpenBrowserStoreOptions } from "./browser.t"

export type { BrowserMetaforStore, OpenBrowserStoreOptions } from "./browser.t"

const DEFAULT_BROWSER_STORE_NAME = "metafor-store"

export const open = async (options: OpenBrowserStoreOptions = {}): Promise<BrowserMetaforStore> => {
  const databaseName = options.databaseName ?? DEFAULT_BROWSER_STORE_NAME
  const metaDatabaseName = options.metaDatabaseName ?? `${databaseName}-meta`
  const actorDatabaseName = options.actorDatabaseName ?? `${databaseName}-actor`
  const viewDatabaseName = options.viewDatabaseName ?? metaDatabaseName

  const metaOptions: DbIndexedDbBackendOptions = {
    databaseName: metaDatabaseName,
    ...(options.version !== undefined ? { version: options.version } : {}),
    ...(options.indexedDb !== undefined ? { indexedDb: options.indexedDb } : {}),
  }
  const viewOptions: DbIndexedDbBackendOptions = {
    databaseName: viewDatabaseName,
    ...(options.version !== undefined ? { version: options.version } : {}),
    ...(options.indexedDb !== undefined ? { indexedDb: options.indexedDb } : {}),
  }
  const actorOptions: IdbDbActorStoreOptions = {
    databaseName: actorDatabaseName,
    ...(options.actorVersion !== undefined ? { version: options.actorVersion } : {}),
    ...(options.indexedDb !== undefined ? { factory: options.indexedDb } : {}),
  }

  const metaBackend = await openDbIndexedDbBackend(metaOptions)
  const viewBackend = viewDatabaseName === metaDatabaseName ? metaBackend : await openDbIndexedDbBackend(viewOptions)
  const actorRows = await createIdbDbActorStore(actorOptions)

  return createMetaforStore({ metaBackend, viewBackend, actorBackend: actorRows })
}
