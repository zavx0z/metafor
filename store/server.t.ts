import type { SQL } from "bun"
import type { MetaDSL } from "../metafor.t.ts"
import type { Meta } from "@store/meta"
import type { Actor, ActorRoots, ActorRows, Value } from "@store/actor"
import type { ActorRecord, ActorValueRecord } from "@store/actor"

export interface OpenServerStoreOptions {
  /** Путь к SQLite-файлу. По умолчанию `:memory:`. */
  filename?: string
}

// ────────────────────────────── meta ORM ──────────────────────────────

export interface MetaApi {
  /** Создаёт декларацию по `src`. Идемпотентно: DELETE-then-INSERT. */
  create(src: string, dsl: MetaDSL): Promise<Meta>
  /** Возвращает Meta-инстанс по `src` или `null`. */
  get(src: string): Promise<Meta | null>
  /** Удаляет декларацию по `src`. Каскад FK снимет всё дерево. */
  delete(src: string): Promise<void>
}

// ────────────────────────────── actor ORM ──────────────────────────────

export interface ActorApi {
  create(rows: ActorRows): Promise<Actor>
  get(uuid: string): Promise<Actor | null>
  delete(uuid: string): Promise<void>
  head(uuid: string): Promise<ActorRecord | null>
  readonly roots: ActorRoots
  readonly value: ValueApi
  readonly link: LinkApi
}

// ────────────────────────────── value ORM ──────────────────────────────

export interface ValueApi {
  get(uuid: string): Promise<Value | null>
}

// ────────────────────────────── link ORM ──────────────────────────────

export interface LinkApi {
  get(actor: string, field: string): Promise<ActorValueRecord | null>
  share(actor: string, field: string, value: string): Promise<void>
  fork(actor: string, field: string): Promise<string>
}

// ────────────────────────────── корневой стор ──────────────────────────────

export interface ServerStore {
  /** Низкоуровневый Bun.SQL handle (для прямых запросов и тестов). */
  readonly sql: SQL
  readonly meta: MetaApi
  readonly actor: ActorApi
  close(): Promise<void>
}
