/**
 * Сущность `value` — глобальные записи значений, могут разделяться несколькими
 * акторами через `actor_value` (entanglement).
 *
 * Применён тот же паттерн, что и для `field_default` в meta-схеме:
 * - корневая таблица — только uuid + kind (дискриминатор)
 * - скалярные подтаблицы `value_<kind>` per type
 * - `value_list_item` — плоская таблица с `item_value TEXT NOT NULL`
 *   (по аналогии с `field_array_default_item`); тип элемента восстанавливается
 *   рантаймом через meta-схему родительского поля.
 *
 * Якорный файл сущности — под ним группируются:
 * - `value.sql` — DDL (6 таблиц: value + 4 скалярных + value_list_item)
 * - `value.t.ts` — типы (Scalar, ValueRecord — discriminated union, ValueItemRecord)
 * - `value.U.ts` — Update (setValue, writeValueItem, truncateValueItems)
 *
 * ORM-классы `Value` (abstract) + 6 type-specific подклассов
 * (`NullValue` / `BooleanValue` / `NumberValue` / `StringValue` / `EnumValue` /
 * `ListValue`) — в этом файле; используют точечные SELECT-ы по `uuid` и
 * соответствующей подтаблице.
 */

import type { SQL } from "bun"
import type { ActorValueRecord } from "./actor_value.t.ts"
import type { ValueItemRecord, ValueKind } from "./value.t.ts"
import { truncateValueItems, writeValueItem } from "./value.U.ts"

/**
 * Базовый абстрактный класс одной записи `value`. Хранит `(sql, uuid)` и
 * `kind`-дискриминатор. Скалярное содержимое — на type-specific подклассах
 * (`boolean()` / `number()` / `text()` / `variant()` / `items()`).
 *
 * Все методы async — каждое обращение идёт в БД, in-memory кеша нет.
 * Один `Value` может разделяться несколькими акторами через `actor_value`
 * (entanglement); см. `.owners()`.
 */
export abstract class Value {
  constructor(
    protected readonly sql: SQL,
    readonly uuid: string,
  ) {}

  /** Дискриминатор. Известен на этапе construction'а — sync property. */
  abstract readonly kind: ValueKind

  /** Список акторов-владельцев. Длина > 1 = entanglement. */
  async owners(): Promise<ActorValueRecord[]> {
    const rows = await this.sql<Array<{ actor: string; field: string; value: string }>>`
      SELECT actor, field, value FROM actor_value WHERE value = ${this.uuid}
    `
    return rows.map((row) => ({ actor: String(row.actor), field: String(row.field), value: String(row.value) }))
  }

  /** Возвращает Value-инстанс точного подкласса или `null`, если записи нет. */
  static async get(sql: SQL, uuid: string): Promise<AnyValue | null> {
    const row = (
      await sql<Array<{ kind: string }>>`
        SELECT kind FROM value WHERE uuid = ${uuid} LIMIT 1
      `
    )[0]
    if (!row) return null
    return buildValue(sql, uuid, row.kind as ValueKind)
  }
}

/** Запись `value` с `kind = "null"` — без скалярного содержимого. */
export class NullValue extends Value {
  readonly kind = "null" as const
}

/** Запись `value` с `kind = "boolean"`. */
export class BooleanValue extends Value {
  readonly kind = "boolean" as const

  async boolean(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ boolean: number }>>`
        SELECT boolean FROM value_boolean WHERE value = ${this.uuid}
      `
    )[0]
    if (!row) throw new Error(`value_boolean ${this.uuid} not found`)
    return row.boolean === 1
  }

  async setBoolean(value: boolean): Promise<void> {
    await this.sql`
      UPDATE value_boolean SET boolean = ${value ? 1 : 0} WHERE value = ${this.uuid}
    `
  }
}

/** Запись `value` с `kind = "number"`. */
export class NumberValue extends Value {
  readonly kind = "number" as const

  async number(): Promise<number> {
    const row = (
      await this.sql<Array<{ number: number }>>`
        SELECT number FROM value_number WHERE value = ${this.uuid}
      `
    )[0]
    if (!row) throw new Error(`value_number ${this.uuid} not found`)
    return Number(row.number)
  }

  async setNumber(value: number): Promise<void> {
    await this.sql`
      UPDATE value_number SET number = ${value} WHERE value = ${this.uuid}
    `
  }
}

/** Запись `value` с `kind = "string"`. */
export class StringValue extends Value {
  readonly kind = "string" as const

  async text(): Promise<string> {
    const row = (
      await this.sql<Array<{ text: string }>>`
        SELECT text FROM value_string WHERE value = ${this.uuid}
      `
    )[0]
    if (!row) throw new Error(`value_string ${this.uuid} not found`)
    return String(row.text)
  }

  async setText(value: string): Promise<void> {
    await this.sql`
      UPDATE value_string SET text = ${value} WHERE value = ${this.uuid}
    `
  }
}

/** Запись `value` с `kind = "enum"` — variant — uuid из `field_enum_variant`. */
export class EnumValue extends Value {
  readonly kind = "enum" as const

  async variant(): Promise<string> {
    const row = (
      await this.sql<Array<{ variant: string }>>`
        SELECT variant FROM value_enum WHERE value = ${this.uuid}
      `
    )[0]
    if (!row) throw new Error(`value_enum ${this.uuid} not found`)
    return String(row.variant)
  }

  async setVariant(value: string): Promise<void> {
    await this.sql`
      UPDATE value_enum SET variant = ${value} WHERE value = ${this.uuid}
    `
  }
}

/** Запись `value` с `kind = "list"` — элементы в `value_list_item`. */
export class ListValue extends Value {
  readonly kind = "list" as const

  /** Все элементы списочного значения, упорядочены по `position`. */
  async items(): Promise<ValueItemRecord[]> {
    const rows = await this.sql<Array<{ value: string; position: number; item_value: string }>>`
      SELECT value, position, item_value FROM value_list_item WHERE value = ${this.uuid} ORDER BY position
    `
    return rows.map((row) => ({
      value: String(row.value),
      position: Number(row.position),
      itemValue: String(row.item_value),
    }))
  }

  /** Записывает / обновляет один элемент списочного значения по позиции. */
  async writeItem(position: number, itemValue: string): Promise<void> {
    await writeValueItem(this.sql, this.uuid, position, itemValue)
  }

  /** Удаляет хвост списочного значения начиная с указанной позиции. */
  async truncateItems(fromPosition: number): Promise<void> {
    await truncateValueItems(this.sql, this.uuid, fromPosition)
  }
}

/**
 * Дискриминированный union возможных value-инстансов. `Value.get` /
 * `ActorFieldValue.value` возвращают именно его, а не абстрактный `Value`,
 * чтобы TS сужал по `value.kind`.
 */
export type AnyValue = NullValue | BooleanValue | NumberValue | StringValue | EnumValue | ListValue

/** Factory: инстанцирует точный подкласс `Value` по `kind`. */
const buildValue = (sql: SQL, uuid: string, kind: ValueKind): AnyValue => {
  switch (kind) {
    case "null":
      return new NullValue(sql, uuid)
    case "boolean":
      return new BooleanValue(sql, uuid)
    case "number":
      return new NumberValue(sql, uuid)
    case "string":
      return new StringValue(sql, uuid)
    case "enum":
      return new EnumValue(sql, uuid)
    case "list":
      return new ListValue(sql, uuid)
    default:
      throw new Error(`Unknown value.kind '${kind as string}' for ${uuid}`)
  }
}
