/**
 * Server-side entry-point: открывает одну bun-sqlite Database и применяет
 * единую схему стора — таблицы из обоих пакетов (`@store/meta` и
 * `@store/actor`). Логически она разделена на meta-сущности (DSL-декларация)
 * и actor-сущности (инстансный слой) — но это деление по пакетам ради
 * удобства разработки, не разные базы. FK работают как обычно.
 *
 * Возвращает `{ database, close }` — низкоуровневый Database handle для прямых
 * вызовов функций из `@store/meta/sqlite` (metaCreate, metaGet, metaDelete) и
 * `@store/actor/sqlite` (actorCreate, actorGet, ..., valueGet, ..., stateGet,
 * ..., linkGet, ...). Никаких фасад-объектов: симметричный функциональный API.
 *
 * Типы — в `./server.t.ts`.
 */

import { Database, constants } from "bun:sqlite"
import { metaSchemaSql } from "@store/meta/sqlite"
import { actorSchemaSql } from "@store/actor/sqlite"
import type { OpenServerStoreOptions, ServerStore } from "./server.t.ts"

const isFileBacked = (filename: string): boolean => filename !== ":memory:"

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

  // Единая схема стора: meta-таблицы + actor-таблицы на одной Database.
  database.run(metaSchemaSql)
  database.run(actorSchemaSql)

  return {
    database,
    close() {
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
