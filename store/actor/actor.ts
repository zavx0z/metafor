import type { SQL } from "bun"
import type { ActorRecord, ActorRows, ActorStateRecord } from "./index.ts"
import {
  actorCreate,
  actorDelete,
  actorGet,
  actorHead,
  actorListChildren,
  actorListRoots,
  stateGet,
  stateSet,
} from "./sqlite/index.ts"
import { ActorFieldValue } from "./value.ts"

/** Django-style manager: дочерние акторы одного родителя. */
export class ActorChildren {
  constructor(
    private readonly sql: SQL,
    private readonly parentUuid: string,
  ) {}

  async all(): Promise<Actor[]> {
    const rows = await actorListChildren(this.sql, this.parentUuid)
    return rows.map((row) => new Actor(this.sql, row.uuid))
  }

  async get({ uuid }: { uuid: string }): Promise<Actor | null> {
    const head = await actorHead(this.sql, uuid)
    if (!head || head.parent !== this.parentUuid) return null
    return new Actor(this.sql, uuid)
  }

  async count(): Promise<number> {
    return (await actorListChildren(this.sql, this.parentUuid)).length
  }

  async exists(): Promise<boolean> {
    return (await actorListChildren(this.sql, this.parentUuid)).length > 0
  }
}

/** Django-style manager: actor_value-линки одного актора. */
export class ActorValues {
  constructor(
    private readonly sql: SQL,
    private readonly actorUuid: string,
  ) {}

  async all(): Promise<ActorFieldValue[]> {
    const rows = await actorGet(this.sql, this.actorUuid)
    if (!rows) return []
    return rows.values.map((av) => new ActorFieldValue(this.sql, this.actorUuid, av.field))
  }

  async get({ field }: { field: string }): Promise<ActorFieldValue | null> {
    return ActorFieldValue.get(this.sql, this.actorUuid, field)
  }

  async count(): Promise<number> {
    const rows = await actorGet(this.sql, this.actorUuid)
    return rows ? rows.values.length : 0
  }
}

/** Django-style manager: корневые акторы (parent IS NULL). */
export class ActorRoots {
  constructor(private readonly sql: SQL) {}

  async all(): Promise<Actor[]> {
    const rows = await actorListRoots(this.sql)
    return rows.map((row) => new Actor(this.sql, row.uuid))
  }

  async get({ uuid }: { uuid: string }): Promise<Actor | null> {
    const head = await actorHead(this.sql, uuid)
    if (!head || head.parent !== null) return null
    return new Actor(this.sql, uuid)
  }

  async count(): Promise<number> {
    return (await actorListRoots(this.sql)).length
  }

  async exists(): Promise<boolean> {
    return (await actorListRoots(this.sql)).length > 0
  }
}

/**
 * Один инстанс актора — корневой ORM-объект пакета `@store/actor`.
 *
 * Скаляры (`meta`, `position`, `parent`, `state`, `rows`) — методы (async, без кеша).
 * Коллекции (`children`, `values`) — Django-style managers с
 * `.all() / .get(filter) / .count() / .exists()`.
 *
 * Каждое обращение — отдельный SELECT в БД; никакого in-memory кеша внутри
 * инстанса. Свежесть данных гарантирована.
 */
export class Actor {
  readonly children: ActorChildren
  readonly values: ActorValues

  constructor(
    private readonly sql: SQL,
    readonly uuid: string,
  ) {
    this.children = new ActorChildren(sql, uuid)
    this.values = new ActorValues(sql, uuid)
  }

  /** Имя меты, по которой создан актор. */
  async meta(): Promise<string> {
    const head = await actorHead(this.sql, this.uuid)
    if (!head) throw new Error(`actor ${this.uuid} not found`)
    return head.meta
  }

  /** Позиция актора среди sibling-ов. */
  async position(): Promise<number> {
    const head = await actorHead(this.sql, this.uuid)
    if (!head) throw new Error(`actor ${this.uuid} not found`)
    return head.position
  }

  /** Родительский Actor или `null`, если корневой. */
  async parent(): Promise<Actor | null> {
    const head = await actorHead(this.sql, this.uuid)
    if (!head || head.parent === null) return null
    return new Actor(this.sql, head.parent)
  }

  /** Текущее FSM-состояние актора. */
  async state(): Promise<ActorStateRecord | null> {
    return stateGet(this.sql, this.uuid)
  }

  /** Полный row-group актора (actor + values + state). Бросает, если актор исчез. */
  async rows(): Promise<ActorRows> {
    const rows = await actorGet(this.sql, this.uuid)
    if (!rows) throw new Error(`actor ${this.uuid} not found`)
    return rows
  }

  /** Меняет состояние FSM (upsert). */
  async setState(metaState: string): Promise<void> {
    await stateSet(this.sql, this.uuid, metaState)
  }

  /** Удаляет актора и orphan-value (на которые больше никто не ссылается). */
  async delete(): Promise<void> {
    await actorDelete(this.sql, this.uuid)
  }

  /** Создаёт актора из row-group (actor + values + value-records + state). */
  static async create(sql: SQL, rows: ActorRows): Promise<Actor> {
    await actorCreate(sql, rows)
    return new Actor(sql, rows.actor.uuid)
  }

  /** Возвращает Actor-инстанс или `null`, если актор отсутствует. */
  static async get(sql: SQL, uuid: string): Promise<Actor | null> {
    return (await actorHead(sql, uuid)) === null ? null : new Actor(sql, uuid)
  }

  /** Удаляет актора по uuid (без создания инстанса). */
  static async delete(sql: SQL, uuid: string): Promise<void> {
    await actorDelete(sql, uuid)
  }

  /** Базовая запись актора (actor-таблица) без связанных value/state. */
  static async head(sql: SQL, uuid: string): Promise<ActorRecord | null> {
    return actorHead(sql, uuid)
  }

  /** Manager корневых акторов (parent IS NULL). */
  static roots(sql: SQL): ActorRoots {
    return new ActorRoots(sql)
  }
}
