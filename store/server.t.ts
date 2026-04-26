import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../metafor.t.ts"
import type { DarkMetaParticleModel } from "@store/meta/sqlite/read.t.ts"
import type { ActorRecord, ActorRows } from "@store/actor/sqlite/actor.t.ts"
import type { ActorStateRecord } from "@store/actor/sqlite/state.t.ts"
import type { ActorValueRecord } from "@store/actor/sqlite/actor_value.t.ts"
import type { Scalar, ValueItemRecord, ValueRecord } from "@store/actor/sqlite/value.t.ts"

export interface OpenServerStoreOptions {
  /** Путь к SQLite-файлу. По умолчанию `:memory:`. */
  filename?: string
}

// ────────────────────────────── meta ORM ──────────────────────────────

export interface MetaApi {
  /** Создаёт декларацию по `src`. Идемпотентно: DELETE-then-INSERT. */
  create(src: string, dsl: MetaDSL): MetaInstance
  /** Возвращает инстанс декларации по `src` или `null`. */
  get(src: string): MetaInstance | null
  /** Удаляет декларацию по `src`. Каскад FK снимет всё дерево. */
  delete(src: string): void
}

/** Lazy-инстанс одной декларации меты. Getter-ы делают SELECT при первом доступе. */
export interface MetaInstance {
  readonly src: string
  /** Сборка runtime-модели (fieldSchemas, superposition, processes, reactions, particles, ...). */
  readonly model: DarkMetaParticleModel
  /** Удаляет эту декларацию из БД. */
  delete(): void
}

// ────────────────────────────── actor ORM ──────────────────────────────

export interface ActorApi {
  /** Записывает row-group актора одной транзакцией. Возвращает инстанс. */
  create(rows: ActorRows): ActorInstance
  /** Возвращает инстанс актора по uuid или `null`. */
  get(uuid: string): ActorInstance | null
  /** Удаляет актора (каскад) и orphan-value. */
  delete(uuid: string): void
  /** Все корневые акторы (parent IS NULL). */
  readonly roots: ActorInstance[]
  /** Базовая запись актора без связанных value/state. */
  head(uuid: string): ActorRecord | null
  /** Точечные операции над любой записью value (без привязки к актору). */
  readonly value: ValueApi
  /** Junction `actor_value` (entanglement через shared value). */
  readonly link: LinkApi
}

/** Lazy-инстанс одного актора. */
export interface ActorInstance {
  readonly uuid: string
  readonly meta: string
  readonly position: number
  /** Родитель (lazy lookup). `null` у корневого. */
  readonly parent: ActorInstance | null
  /** Дочерние акторы (lazy SELECT по parent=uuid). */
  readonly children: ActorInstance[]
  /** Текущее FSM-состояние. */
  readonly state: ActorStateRecord | null
  /** Полный row-group (actor + values + valueRecords + valueItems + state). */
  readonly rows: ActorRows
  /** Меняет FSM-состояние актора. */
  setState(metaState: string): void
  /** Возвращает инстанс значения, привязанного к этому актору по полю. */
  value(field: string): ActorFieldValueInstance | null
  /** Удаляет этого актора. Каскад FK + orphan-cleanup. */
  delete(): void
}

/** Lazy-инстанс значения, видимого через конкретного актора (через `actor_value`). */
export interface ActorFieldValueInstance {
  readonly actor: string
  readonly field: string
  readonly value: ValueInstance
  /** Связывает этот слот с другой записью value (entanglement). */
  share(valueUuid: string): void
  /** Расщепляет shared value: создаёт новую копию, возвращает её instance. */
  fork(): ValueInstance
}

// ────────────────────────────── value ORM ──────────────────────────────

export interface ValueApi {
  /** Возвращает инстанс записи value по uuid или `null`. */
  get(uuid: string): ValueInstance | null
}

/** Lazy-инстанс одной записи value. */
export interface ValueInstance {
  readonly uuid: string
  readonly record: ValueRecord
  /** Кто разделяет эту запись (для list-результата длиной > 1 — entanglement). */
  readonly owners: ActorValueRecord[]
  /** Элементы списочного значения (когда kind === "list"). */
  readonly items: ValueItemRecord[]
  /** Меняет содержимое (касается всех акторов, разделяющих эту запись). */
  set(scalar: Scalar | { kind: "list" }): void
  /** Записывает / обновляет один элемент списка. */
  writeItem(position: number, itemValue: string): void
  /** Удаляет хвост списка начиная с позиции. */
  truncateItems(fromPosition: number): void
}

// ────────────────────────────── link ORM ──────────────────────────────

export interface LinkApi {
  /** Связь по (actor, field). */
  get(actor: string, field: string): ActorValueRecord | null
  /** Привязывает (actor, field) к существующей записи value. */
  share(actor: string, field: string, value: string): void
  /** Расщепляет shared value под (actor, field). Возвращает новый uuid. */
  fork(actor: string, field: string): string
}

// ────────────────────────────── корневой стор ──────────────────────────────

export interface ServerStore {
  /** Низкоуровневый Database handle (для прямых запросов и тестов). */
  readonly database: Database
  /** ORM поверх meta-DSL-relational схемы. */
  readonly meta: MetaApi
  /** ORM поверх actor-инстансного слоя. */
  readonly actor: ActorApi
  /** Закрывает Database. */
  close(): void
}
