/**
 * Server-side ORM-стор: открывает одну bun-sqlite Database, применяет единую
 * схему стора (meta-DSL-relational + actor-инстансный слой) и возвращает
 * ORM-фасад с namespace-ами `meta` и `actor`.
 *
 * ORM построен поверх pure-функций пакетов `@store/meta/sqlite` и
 * `@store/actor/sqlite`. Геттеры на инстансах **ленивые** — каждый делает
 * SELECT при первом обращении (принцип `store/README.md` §5).
 *
 * Контракты `ServerStore`/`MetaApi`/`ActorApi`/инстансы — в `./server.t.ts`.
 */

import { Database, constants } from "bun:sqlite"
import { metaCreate, metaDelete, metaGet, metaSchemaSql } from "@store/meta/sqlite"
import {
  actorCreate,
  actorDelete,
  actorGet,
  actorHead,
  actorListChildren,
  actorListRoots,
  actorSchemaSql,
  linkFork,
  linkGet,
  linkShare,
  stateGet,
  stateSet,
  valueGet,
  valueItemsGet,
  valueItemsTruncate,
  valueItemsWrite,
  valueOwners,
  valueSet,
} from "@store/actor/sqlite"
import type {
  ActorApi,
  ActorFieldValueInstance,
  ActorInstance,
  LinkApi,
  MetaApi,
  MetaInstance,
  OpenServerStoreOptions,
  ServerStore,
  ValueApi,
  ValueInstance,
} from "./server.t.ts"

const isFileBacked = (filename: string): boolean => filename !== ":memory:"

const buildValueInstance = (database: Database, uuid: string): ValueInstance => ({
  uuid,
  get record() {
    const row = valueGet(database, uuid)
    if (!row) throw new Error(`value ${uuid} not found`)
    return row
  },
  get owners() {
    return valueOwners(database, uuid)
  },
  get items() {
    return valueItemsGet(database, uuid)
  },
  set: (scalar) => valueSet(database, uuid, scalar),
  writeItem: (position, itemValue) => valueItemsWrite(database, uuid, position, itemValue),
  truncateItems: (fromPosition) => valueItemsTruncate(database, uuid, fromPosition),
})

const buildActorInstance = (database: Database, uuid: string): ActorInstance => ({
  uuid,
  get meta() {
    const head = actorHead(database, uuid)
    if (!head) throw new Error(`actor ${uuid} not found`)
    return head.meta
  },
  get position() {
    const head = actorHead(database, uuid)
    if (!head) throw new Error(`actor ${uuid} not found`)
    return head.position
  },
  get parent() {
    const head = actorHead(database, uuid)
    if (!head || head.parent === null) return null
    return buildActorInstance(database, head.parent)
  },
  get children() {
    return actorListChildren(database, uuid).map((row) => buildActorInstance(database, row.uuid))
  },
  get state() {
    return stateGet(database, uuid)
  },
  get rows() {
    const rows = actorGet(database, uuid)
    if (!rows) throw new Error(`actor ${uuid} not found`)
    return rows
  },
  setState: (metaState) => stateSet(database, uuid, metaState),
  value: (field) => buildActorFieldValueInstance(database, uuid, field),
  delete: () => actorDelete(database, uuid),
})

const buildActorFieldValueInstance = (
  database: Database,
  actor: string,
  field: string,
): ActorFieldValueInstance | null => {
  const link = linkGet(database, actor, field)
  if (!link) return null
  return {
    actor,
    field,
    get value() {
      return buildValueInstance(database, link.value)
    },
    share: (valueUuid) => linkShare(database, actor, field, valueUuid),
    fork: () => buildValueInstance(database, linkFork(database, actor, field)),
  }
}

const buildMetaInstance = (database: Database, src: string): MetaInstance => ({
  src,
  get model() {
    const model = metaGet(database, src)
    if (!model) throw new Error(`meta "${src}" not found`)
    return model
  },
  delete: () => metaDelete(database, src),
})

const buildMetaApi = (database: Database): MetaApi => ({
  create: (src, dsl) => {
    metaCreate(database, src, dsl)
    return buildMetaInstance(database, src)
  },
  get: (src) => (metaGet(database, src) === null ? null : buildMetaInstance(database, src)),
  delete: (src) => metaDelete(database, src),
})

const buildValueApi = (database: Database): ValueApi => ({
  get: (uuid) => (valueGet(database, uuid) === null ? null : buildValueInstance(database, uuid)),
})

const buildLinkApi = (database: Database): LinkApi => ({
  get: (actor, field) => linkGet(database, actor, field),
  share: (actor, field, value) => linkShare(database, actor, field, value),
  fork: (actor, field) => linkFork(database, actor, field),
})

const buildActorApi = (database: Database): ActorApi => {
  const value = buildValueApi(database)
  const link = buildLinkApi(database)
  return {
    create: (rows) => {
      actorCreate(database, rows)
      return buildActorInstance(database, rows.actor.uuid)
    },
    get: (uuid) => (actorHead(database, uuid) === null ? null : buildActorInstance(database, uuid)),
    delete: (uuid) => actorDelete(database, uuid),
    head: (uuid) => actorHead(database, uuid),
    get roots() {
      return actorListRoots(database).map((row) => buildActorInstance(database, row.uuid))
    },
    value,
    link,
  }
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

  // Единая схема стора: meta-таблицы + actor-таблицы на одной Database.
  database.run(metaSchemaSql)
  database.run(actorSchemaSql)

  return {
    database,
    meta: buildMetaApi(database),
    actor: buildActorApi(database),
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
