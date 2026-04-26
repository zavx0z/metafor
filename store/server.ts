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
import { Actor, Value } from "@store/actor"
import type { ActorValueRecord } from "@store/actor"
import { actorSchemaSql, linkFork, linkShare } from "@store/actor/sqlite"
import type { ActorApi, LinkApi, MetaApi, OpenServerStoreOptions, ServerStore, ValueApi } from "./server.t.ts"

// ────────────────────────────── meta / actor / value API: тонкие обёртки над классами ──────────────────────────────

const buildMetaApi = (sql: SQL): MetaApi => ({
  create: (src, dsl) => Meta.create(sql, src, dsl),
  get: (src) => Meta.get(sql, src),
  delete: (src) => Meta.delete(sql, src),
})

const buildValueApi = (sql: SQL): ValueApi => ({
  get: (uuid) => Value.get(sql, uuid),
})

const linkGetRecord = async (sql: SQL, actor: string, field: string): Promise<ActorValueRecord | null> => {
  const row = (
    await sql<Array<{ actor: string; field: string; value: string }>>`
      SELECT actor, field, value FROM actor_value WHERE actor = ${actor} AND field = ${field} LIMIT 1
    `
  )[0]
  return row ? { actor: String(row.actor), field: String(row.field), value: String(row.value) } : null
}

const buildLinkApi = (sql: SQL): LinkApi => ({
  get: (actor, field) => linkGetRecord(sql, actor, field),
  share: (actor, field, value) => linkShare(sql, actor, field, value),
  fork: (actor, field) => linkFork(sql, actor, field),
})

const buildActorApi = (sql: SQL): ActorApi => ({
  create: (rows) => Actor.create(sql, rows),
  get: (uuid) => Actor.get(sql, uuid),
  delete: (uuid) => Actor.delete(sql, uuid),
  head: (uuid) => Actor.head(sql, uuid),
  roots: Actor.roots(sql),
  value: buildValueApi(sql),
  link: buildLinkApi(sql),
})

// ────────────────────────────── корневой open() ──────────────────────────────

const isFileBacked = (filename: string): boolean => filename !== ":memory:"

const buildSqliteUrl = (filename: string): string =>
  filename === ":memory:" ? "sqlite::memory:" : `sqlite://${filename}`

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
