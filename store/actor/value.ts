import type { SQL } from "bun"
import type { ActorValueRecord, Scalar, ValueItemRecord, ValueRecord } from "./index.ts"
import {
  linkFork,
  linkGet,
  linkShare,
  valueGet,
  valueItemsGet,
  valueItemsTruncate,
  valueItemsWrite,
  valueOwners,
  valueSet,
} from "./sqlite/index.ts"

/**
 * ORM-инстанс записи `value`.
 *
 * Все методы async — каждое обращение идёт в БД, in-memory кеша нет.
 * Один `Value` может разделяться несколькими акторами через `actor_value`
 * (entanglement); см. `.owners()`.
 */
export class Value {
  constructor(
    private readonly sql: SQL,
    readonly uuid: string,
  ) {}

  /** Полная запись `value`. Бросает, если запись исчезла из БД. */
  async record(): Promise<ValueRecord> {
    const row = await valueGet(this.sql, this.uuid)
    if (!row) throw new Error(`value ${this.uuid} not found`)
    return row
  }

  /** Список акторов-владельцев. Длина > 1 = entanglement. */
  async owners(): Promise<ActorValueRecord[]> {
    return valueOwners(this.sql, this.uuid)
  }

  /** Все элементы списочного значения, упорядочены по `position`. */
  async items(): Promise<ValueItemRecord[]> {
    return valueItemsGet(this.sql, this.uuid)
  }

  /** Меняет содержимое записи (касается всех акторов, разделяющих её). */
  async set(scalar: Scalar | { kind: "list" }): Promise<void> {
    await valueSet(this.sql, this.uuid, scalar)
  }

  /** Записывает / обновляет один элемент списочного значения по позиции. */
  async writeItem(position: number, itemValue: string): Promise<void> {
    await valueItemsWrite(this.sql, this.uuid, position, itemValue)
  }

  /** Удаляет хвост списочного значения начиная с указанной позиции. */
  async truncateItems(fromPosition: number): Promise<void> {
    await valueItemsTruncate(this.sql, this.uuid, fromPosition)
  }

  /** Возвращает Value-инстанс или `null`, если записи нет. */
  static async get(sql: SQL, uuid: string): Promise<Value | null> {
    return (await valueGet(sql, uuid)) === null ? null : new Value(sql, uuid)
  }
}

/**
 * ORM-инстанс связи `actor_value` (одно поле одного актора).
 *
 * Линк = пара (actor, field), указывающая на конкретный `value.uuid`.
 * `share` подменяет указатель (entanglement), `fork` расщепляет (создаёт
 * собственную копию `value`).
 */
export class ActorFieldValue {
  constructor(
    private readonly sql: SQL,
    readonly actor: string,
    readonly field: string,
  ) {}

  /** Текущий `Value` под этим линком. Бросает, если линк исчез. */
  async value(): Promise<Value> {
    const link = await linkGet(this.sql, this.actor, this.field)
    if (!link) throw new Error(`actor_value (${this.actor}, ${this.field}) not found`)
    return new Value(this.sql, link.value)
  }

  /** Привязать актор-поле к существующей записи value (entanglement). */
  async share(valueUuid: string): Promise<void> {
    await linkShare(this.sql, this.actor, this.field, valueUuid)
  }

  /** Расщепить shared value: создаётся новая копия записи под этого актора. */
  async fork(): Promise<Value> {
    const newUuid = await linkFork(this.sql, this.actor, this.field)
    return new Value(this.sql, newUuid)
  }

  /** Возвращает инстанс или `null`, если линк отсутствует. */
  static async get(sql: SQL, actor: string, field: string): Promise<ActorFieldValue | null> {
    return (await linkGet(sql, actor, field)) === null ? null : new ActorFieldValue(sql, actor, field)
  }
}
