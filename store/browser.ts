import { openDbIndexedDbBackend, type DbIndexedDbBackendOptions } from "store/db/browser"
import { createIdbDbActorStore, type IdbDbActorStoreOptions } from "@store/actor"
import { createMetaforStore } from "./index.ts"
import type { BrowserMetaforStore, OpenBrowserStoreOptions } from "./browser.t"

export type { BrowserMetaforStore, OpenBrowserStoreOptions } from "./browser.t"

const DEFAULT_BROWSER_STORE_NAME = "metafor-store"

export const open = async (options: OpenBrowserStoreOptions = {}): Promise<BrowserMetaforStore> => {
  const databaseName = options.databaseName ?? DEFAULT_BROWSER_STORE_NAME
  const actorDatabaseName = `${databaseName}-actor`

  const metaViewOptions: DbIndexedDbBackendOptions = {
    databaseName,
    ...(options.version !== undefined ? { version: options.version } : {}),
    ...(options.indexedDb !== undefined ? { indexedDb: options.indexedDb } : {}),
  }
  const actorOptions: IdbDbActorStoreOptions = {
    databaseName: actorDatabaseName,
    ...(options.actorVersion !== undefined ? { version: options.actorVersion } : {}),
    ...(options.indexedDb !== undefined ? { factory: options.indexedDb } : {}),
  }

  const metaViewBackend = await openDbIndexedDbBackend(metaViewOptions)
  const actorBackend = await createIdbDbActorStore(actorOptions)

  return createMetaforStore({
    metaBackend: metaViewBackend,
    viewBackend: metaViewBackend,
    actorBackend,
  })
}
