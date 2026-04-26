/**
 * Server-side entry: одна bun-sqlite Database держит **единую схему** стора.
 * Логически она разделена на meta-сущности (DSL-декларация) и actor-сущности
 * (инстансный слой) — но это деление по пакетам ради удобства разработки,
 * не разные базы. Все FK работают как обычно (под `PRAGMA foreign_keys = ON`).
 *
 * Возвращает связку `{ database, meta, actor, close }`:
 * - `database` — низкоуровневый bun-sqlite handle (для прямых запросов, тестов, миграций)
 * - `meta` — функции записи/чтения декларации (write, read)
 * - `actor` — реализация {@link ActorBackend} над тем же `database`
 *
 * Типы — в `./server.t.ts`.
 */

import { Database, constants } from "bun:sqlite"
import {
  initializeMetaDslSchema,
  readDarkParticleModel,
  relation as writeMetaToDsl,
} from "@store/meta/sqlite"
import { createSqliteActorBackend } from "@store/actor/sqlite"
import type { MetaDSL } from "../metafor.t.ts"
import type { OpenServerStoreOptions, ServerMetaApi, ServerStore } from "./server.t.ts"

const isFileBacked = (filename: string): boolean => filename !== ":memory:"

const idempotentWriteMeta = (db: Database, meta: MetaDSL, src: string): void => {
  // FK в DSL-relational имеет ON DELETE CASCADE на meta(src) — снимет всё дерево записи.
  db.prepare(`DELETE FROM meta WHERE src = ?`).run(src)
  writeMetaToDsl(db, meta, src)
}

export const open = (options: OpenServerStoreOptions = {}): ServerStore => {
  const filename = options.filename ?? ":memory:"
  const fileBacked = isFileBacked(filename)

  const database = new Database(filename, { strict: true, create: true })
  database.run("PRAGMA foreign_keys = ON;")
  if (fileBacked) {
    database.run("PRAGMA journal_mode = WAL;")
    database.run("PRAGMA synchronous = NORMAL;")
    database.run("PRAGMA busy_timeout = 5000;")
  }

  initializeMetaDslSchema(database)
  const actor = createSqliteActorBackend({ database })

  const meta: ServerMetaApi = {
    write: (src, dsl) => idempotentWriteMeta(database, dsl, src),
    read: (src) => readDarkParticleModel(database, src),
  }

  return {
    database,
    meta,
    actor,
    async close() {
      try {
        await actor.close()
      } catch {
        // ignore
      }
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
