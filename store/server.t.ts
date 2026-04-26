import type { SQL } from "bun"
import type { MetaDSL } from "../metafor.t.ts"
import type { Meta } from "@store/meta"
import type {
  ActorRecord,
  ActorRows,
  ActorStateRecord,
  ActorValueRecord,
  Scalar,
  ValueItemRecord,
  ValueRecord,
} from "@store/actor"

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

export interface ActorRootsManager {
  all(): Promise<ActorInstance[]>
  get(filter: { uuid: string }): Promise<ActorInstance | null>
  count(): Promise<number>
  exists(): Promise<boolean>
}

export interface ActorChildrenManager {
  all(): Promise<ActorInstance[]>
  get(filter: { uuid: string }): Promise<ActorInstance | null>
  count(): Promise<number>
  exists(): Promise<boolean>
}

export interface ActorValuesManager {
  all(): Promise<ActorFieldValueInstance[]>
  get(filter: { field: string }): Promise<ActorFieldValueInstance | null>
  count(): Promise<number>
}

export interface ActorApi {
  create(rows: ActorRows): Promise<ActorInstance>
  get(uuid: string): Promise<ActorInstance | null>
  delete(uuid: string): Promise<void>
  readonly roots: ActorRootsManager
  head(uuid: string): Promise<ActorRecord | null>
  readonly value: ValueApi
  readonly link: LinkApi
}

export interface ActorInstance {
  readonly uuid: string
  meta(): Promise<string>
  position(): Promise<number>
  parent(): Promise<ActorInstance | null>
  readonly children: ActorChildrenManager
  readonly values: ActorValuesManager
  state(): Promise<ActorStateRecord | null>
  rows(): Promise<ActorRows>
  setState(metaState: string): Promise<void>
  delete(): Promise<void>
}

export interface ActorFieldValueInstance {
  readonly actor: string
  readonly field: string
  value(): Promise<ValueInstance>
  share(valueUuid: string): Promise<void>
  fork(): Promise<ValueInstance>
}

// ────────────────────────────── value ORM ──────────────────────────────

export interface ValueApi {
  get(uuid: string): Promise<ValueInstance | null>
}

export interface ValueInstance {
  readonly uuid: string
  record(): Promise<ValueRecord>
  owners(): Promise<ActorValueRecord[]>
  items(): Promise<ValueItemRecord[]>
  set(scalar: Scalar | { kind: "list" }): Promise<void>
  writeItem(position: number, itemValue: string): Promise<void>
  truncateItems(fromPosition: number): Promise<void>
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
