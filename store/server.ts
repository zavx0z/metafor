import { Database, constants } from "bun:sqlite"
import { openDbSqliteBackend } from "store/db"
import { createSqliteDbActorStore, initializeDbActorSqliteSchema } from "@store/actor"
import {
  initializeMetaDslSchema,
  readDarkParticleModel,
  relation,
} from "@store/meta/sqlite"
import { createMetaforStore } from "./index.ts"
import type { OpenServerStoreOptions, ServerMetaforStore, ServerMetaStoreOrm } from "./server.t.ts"

const DEFAULT_SQLITE_FILENAME = ":memory:"

const isFileBackedSqlite = (filename: string): boolean => filename !== ":memory:"

/**
 * Открывает unified SQLite Database с тремя группами таблиц:
 * - meta DSL-relational (`@store/meta/sqlite`, 33 таблицы без префикса)
 * - view (`@store/view`, 10 таблиц `view_*`)
 * - actor (`@store/actor`, 2 таблицы `actor_*`)
 * - canonical-meta (legacy `store/db`, 14 таблиц `meta_*`) — будет удалён после adapter
 */
export const open = (options: OpenServerStoreOptions = {}): ServerMetaforStore => {
  const filename = options.filename ?? DEFAULT_SQLITE_FILENAME
  const fileBacked = isFileBackedSqlite(filename)

  const database = new Database(filename, { strict: true, create: true })
  database.run("PRAGMA foreign_keys = ON;")
  if (fileBacked) {
    database.run("PRAGMA journal_mode = WAL;")
    database.run("PRAGMA synchronous = NORMAL;")
    database.run("PRAGMA busy_timeout = 5000;")
  }

  // Применяем все три (четыре с canonical-legacy) схемы к одной Database.
  initializeMetaDslSchema(database)
  initializeDbActorSqliteSchema(database)

  const metaBackend = openDbSqliteBackend({ database })
  const viewBackend = metaBackend
  const actorBackend = createSqliteDbActorStore({ database })
  const store = createMetaforStore({ metaBackend, viewBackend, actorBackend })

  const meta: ServerMetaStoreOrm = {
    ...store.meta,
    database,
    create(src, metaDsl) {
      relation(database, metaDsl, src)
    },
    model(src) {
      return readDarkParticleModel(database, src)
    },
  }

  return {
    ...store,
    meta,
    async close() {
      await store.close()
      try {
        if (fileBacked) {
          database.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0)
          database.run("PRAGMA wal_checkpoint(TRUNCATE);")
        }
        database.close()
      } catch {
        // ignore double-close
      }
    },
  }
}
