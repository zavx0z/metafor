import {
  createSqliteDbActorStore,
  openDbSqliteBackend,
  type DbSqliteBackendOptions,
  type SqliteDbActorStoreOptions,
} from "@metafor/db"
import {
  getMetaDB,
  readDarkParticleModel,
  relation,
} from "@store/meta/sqlite"
import {
  createMetaforStore,
} from "./index.ts"
import type { OpenServerStoreOptions, ServerMetaforStore, ServerMetaStoreOrm } from "./server.t.ts"

const DEFAULT_SQLITE_FILENAME = ":memory:"

export const open = (options: OpenServerStoreOptions = {}): ServerMetaforStore => {
  const filename = options.filename ?? DEFAULT_SQLITE_FILENAME
  const metaFilename = options.metaFilename ?? filename
  const actorFilename = options.actorFilename ?? filename
  const viewFilename = options.viewFilename ?? filename

  const metaDatabase = getMetaDB(metaFilename)
  const metaBackendOptions: DbSqliteBackendOptions = { filename: metaFilename }
  const viewBackendOptions: DbSqliteBackendOptions = { filename: viewFilename }
  const actorOptions: SqliteDbActorStoreOptions = { filename: actorFilename }

  const metaBackend = openDbSqliteBackend(metaBackendOptions)
  const viewBackend = viewFilename === metaFilename ? metaBackend : openDbSqliteBackend(viewBackendOptions)
  const actorRows = createSqliteDbActorStore(actorOptions)
  const store = createMetaforStore({
    metaBackend,
    viewBackend,
    actorRows,
  })

  const meta: ServerMetaStoreOrm = {
    ...store.meta,
    database: metaDatabase,
    create(src, metaDsl) {
      relation(metaDatabase, metaDsl, src)
    },
    model(src) {
      return readDarkParticleModel(metaDatabase, src)
    },
  }

  return {
    ...store,
    meta,
    async close() {
      await store.close()
      try {
        metaDatabase.close()
      } catch {
        // ignore double-close
      }
    },
  }
}
