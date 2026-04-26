/**
 * Server-side ORM-стор: открывает одну `Bun.SQL` (sqlite) и применяет единую
 * схему стора (meta-DSL-relational + actor-инстансный слой). Возвращает
 * фасад с namespace-ами `meta` и `actor`.
 *
 * Все методы async — Bun.SQL работает через tagged template literals.
 * Никакого in-memory кеша — каждый вызов идёт в БД.
 *
 * Контракты — в `./server.t.ts`.
 */

import { SQL } from "bun"
import { metaSchemaSql } from "@store/meta/sqlite"
import { Meta } from "@store/meta"
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
  OpenServerStoreOptions,
  ServerStore,
  ValueApi,
  ValueInstance,
} from "./server.t.ts"

// ────────────────────────────── value/actor (factory-style инстансы) ──────────────────────────────

const buildValueInstance = (sql: SQL, uuid: string): ValueInstance => ({
  uuid,
  async record() {
    const row = await valueGet(sql, uuid)
    if (!row) throw new Error(`value ${uuid} not found`)
    return row
  },
  owners: () => valueOwners(sql, uuid),
  items: () => valueItemsGet(sql, uuid),
  set: (scalar) => valueSet(sql, uuid, scalar),
  writeItem: (position, itemValue) => valueItemsWrite(sql, uuid, position, itemValue),
  truncateItems: (fromPosition) => valueItemsTruncate(sql, uuid, fromPosition),
})

const buildActorFieldValueInstance = async (
  sql: SQL,
  actor: string,
  field: string,
): Promise<ActorFieldValueInstance | null> => {
  const link = await linkGet(sql, actor, field)
  if (!link) return null
  return {
    actor,
    field,
    async value() {
      const fresh = await linkGet(sql, actor, field)
      if (!fresh) throw new Error(`actor_value (${actor}, ${field}) not found`)
      return buildValueInstance(sql, fresh.value)
    },
    share: (valueUuid) => linkShare(sql, actor, field, valueUuid),
    async fork() {
      const newUuid = await linkFork(sql, actor, field)
      return buildValueInstance(sql, newUuid)
    },
  }
}

const buildActorInstance = (sql: SQL, uuid: string): ActorInstance => ({
  uuid,
  async meta() {
    const head = await actorHead(sql, uuid)
    if (!head) throw new Error(`actor ${uuid} not found`)
    return head.meta
  },
  async position() {
    const head = await actorHead(sql, uuid)
    if (!head) throw new Error(`actor ${uuid} not found`)
    return head.position
  },
  async parent() {
    const head = await actorHead(sql, uuid)
    if (!head || head.parent === null) return null
    return buildActorInstance(sql, head.parent)
  },
  children: {
    async all() {
      const rows = await actorListChildren(sql, uuid)
      return rows.map((row) => buildActorInstance(sql, row.uuid))
    },
    async get({ uuid: childUuid }) {
      const head = await actorHead(sql, childUuid)
      if (!head || head.parent !== uuid) return null
      return buildActorInstance(sql, childUuid)
    },
    async count() {
      return (await actorListChildren(sql, uuid)).length
    },
    async exists() {
      return (await actorListChildren(sql, uuid)).length > 0
    },
  },
  values: {
    async all() {
      const rows = await actorGet(sql, uuid)
      if (!rows) return []
      const instances = await Promise.all(
        rows.values.map((av) => buildActorFieldValueInstance(sql, uuid, av.field)),
      )
      return instances.filter((v): v is NonNullable<typeof v> => v !== null)
    },
    async get({ field }: { field: string }) {
      return buildActorFieldValueInstance(sql, uuid, field)
    },
    async count() {
      const rows = await actorGet(sql, uuid)
      return rows ? rows.values.length : 0
    },
  },
  state: () => stateGet(sql, uuid),
  async rows() {
    const rows = await actorGet(sql, uuid)
    if (!rows) throw new Error(`actor ${uuid} not found`)
    return rows
  },
  setState: (metaState) => stateSet(sql, uuid, metaState),
  delete: () => actorDelete(sql, uuid),
})

const buildValueApi = (sql: SQL): ValueApi => ({
  async get(uuid) {
    return (await valueGet(sql, uuid)) === null ? null : buildValueInstance(sql, uuid)
  },
})

const buildLinkApi = (sql: SQL): LinkApi => ({
  get: (actor, field) => linkGet(sql, actor, field),
  share: (actor, field, value) => linkShare(sql, actor, field, value),
  fork: (actor, field) => linkFork(sql, actor, field),
})

const buildActorApi = (sql: SQL): ActorApi => {
  const value = buildValueApi(sql)
  const link = buildLinkApi(sql)
  return {
    async create(rows) {
      await actorCreate(sql, rows)
      return buildActorInstance(sql, rows.actor.uuid)
    },
    async get(uuid) {
      return (await actorHead(sql, uuid)) === null ? null : buildActorInstance(sql, uuid)
    },
    delete: (uuid) => actorDelete(sql, uuid),
    head: (uuid) => actorHead(sql, uuid),
    roots: {
      async all() {
        const rows = await actorListRoots(sql)
        return rows.map((row) => buildActorInstance(sql, row.uuid))
      },
      async get({ uuid }) {
        const head = await actorHead(sql, uuid)
        if (!head || head.parent !== null) return null
        return buildActorInstance(sql, uuid)
      },
      async count() {
        return (await actorListRoots(sql)).length
      },
      async exists() {
        return (await actorListRoots(sql)).length > 0
      },
    },
    value,
    link,
  }
}

// ────────────────────────────── meta API: тонкая обёртка над классом Meta ──────────────────────────────

const buildMetaApi = (sql: SQL): MetaApi => ({
  create: (src, dsl) => Meta.create(sql, src, dsl),
  get: (src) => Meta.get(sql, src),
  delete: (src) => Meta.delete(sql, src),
})

// ────────────────────────────── корневой open() ──────────────────────────────

const isFileBacked = (filename: string): boolean => filename !== ":memory:"

const buildSqliteUrl = (filename: string): string => (filename === ":memory:" ? "sqlite::memory:" : `sqlite://${filename}`)

export const open = async (options: OpenServerStoreOptions = {}): Promise<ServerStore> => {
  const filename = options.filename ?? ":memory:"
  const fileBacked = isFileBacked(filename)

  const sql = new SQL(buildSqliteUrl(filename))

  await sql.unsafe("PRAGMA foreign_keys = ON;")
  if (fileBacked) {
    await sql.unsafe("PRAGMA journal_mode = WAL;")
    await sql.unsafe("PRAGMA synchronous = NORMAL;")
    await sql.unsafe("PRAGMA busy_timeout = 5000;")
  }

  // Единая схема стора: meta-таблицы + actor-таблицы на одной БД.
  await sql.unsafe(metaSchemaSql)
  await sql.unsafe(actorSchemaSql)

  return {
    sql,
    meta: buildMetaApi(sql),
    actor: buildActorApi(sql),
    async close() {
      try {
        if (fileBacked) {
          await sql.unsafe("PRAGMA wal_checkpoint(TRUNCATE);")
        }
        await sql.close()
      } catch {
        // ignore double-close
      }
    },
  }
}
