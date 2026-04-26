/**
 * Сущность `field` + варианты + defaults в DSL-relational схеме.
 *
 * Якорный файл сущности — под ним группируются:
 * - `fields.sql` — DDL (8 таблиц: field, field_default, field_<type>_default,
 *   field_array_default_item, field_enum_variant, field_enum_default)
 * - `fields.t.ts` — типы (FieldRow, MetaFieldSchema, GetFieldsResult, FieldUuidByKey)
 * - `fields.C.ts` — `createFields(db, meta, src)`
 * - `fields.G.ts` — `getFields(db, src)` (bulk-loader для read-проекций)
 *
 * ORM-классы `Field` (abstract) + 5 type-specific подклассов
 * (`StringField` / `NumberField` / `BooleanField` / `ArrayField` / `EnumField`)
 * + `Fields` manager — в этом файле; используют точечные SELECT-ы по
 * `(meta, key)` и не дёргают bulk-loader `getFields`.
 */

import type { SQL } from "bun"
import type { FieldKey } from "../../../metafor.t.ts"

export type FieldType = "string" | "number" | "boolean" | "array" | "enum"

/**
 * Базовый абстрактный класс одного поля декларации. Хранит `(sql, src, key)`
 * и `type`-дискриминатор. Скаляры (`required`, `label`) — общие для всех типов;
 * `default()` и `variants()` — на type-specific подклассах.
 */
export abstract class Field {
  constructor(
    protected readonly sql: SQL,
    protected readonly src: string,
    readonly key: FieldKey,
  ) {}

  /** Дискриминатор. Известен на этапе construction'а — sync property. */
  abstract readonly type: FieldType

  /** Required-флаг. */
  async required(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ required: number }>>`
        SELECT required FROM field WHERE meta = ${this.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.src}`)
    return row.required === 1
  }

  async setRequired(value: boolean): Promise<void> {
    await this.sql`
      UPDATE field SET required = ${value ? 1 : 0}
      WHERE meta = ${this.src} AND key = ${this.key}
    `
  }

  /** Человекочитаемая метка. */
  async label(): Promise<string | undefined> {
    const row = (
      await this.sql<Array<{ label: string | null }>>`
        SELECT label FROM field WHERE meta = ${this.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.src}`)
    return row.label ?? undefined
  }

  async setLabel(value: string | null): Promise<void> {
    await this.sql`
      UPDATE field SET label = ${value}
      WHERE meta = ${this.src} AND key = ${this.key}
    `
  }
}

/** Поле строкового типа. */
export class StringField extends Field {
  readonly type = "string" as const

  async default(): Promise<string | undefined> {
    const row = (
      await this.sql<Array<{ default_value: string }>>`
        SELECT sd.default_value
        FROM field f
        INNER JOIN field_string_default sd ON sd.field = f.uuid
        WHERE f.meta = ${this.src} AND f.key = ${this.key}
      `
    )[0]
    return row?.default_value
  }
}

/** Поле числового типа. */
export class NumberField extends Field {
  readonly type = "number" as const

  async default(): Promise<number | undefined> {
    const row = (
      await this.sql<Array<{ default_value: number }>>`
        SELECT nd.default_value
        FROM field f
        INNER JOIN field_number_default nd ON nd.field = f.uuid
        WHERE f.meta = ${this.src} AND f.key = ${this.key}
      `
    )[0]
    return row?.default_value
  }
}

/** Поле булева типа. */
export class BooleanField extends Field {
  readonly type = "boolean" as const

  async default(): Promise<boolean | undefined> {
    const row = (
      await this.sql<Array<{ default_value: number }>>`
        SELECT bd.default_value
        FROM field f
        INNER JOIN field_boolean_default bd ON bd.field = f.uuid
        WHERE f.meta = ${this.src} AND f.key = ${this.key}
      `
    )[0]
    return row === undefined ? undefined : row.default_value === 1
  }
}

/** Поле-массив (default — список числовых элементов в порядке `position`). */
export class ArrayField extends Field {
  readonly type = "array" as const

  async default(): Promise<number[] | undefined> {
    const rows = await this.sql<Array<{ item_value: string }>>`
      SELECT item.item_value AS item_value
      FROM field f
      INNER JOIN field_array_default_item item ON item.field = f.uuid
      WHERE f.meta = ${this.src} AND f.key = ${this.key}
      ORDER BY item.position
    `
    if (rows.length === 0) return undefined
    return rows.map((row) => Number(row.item_value))
  }
}

/** Поле-enum: имеет `variants` и опциональный `default` (имя варианта). */
export class EnumField extends Field {
  readonly type = "enum" as const

  async default(): Promise<string | undefined> {
    const row = (
      await this.sql<Array<{ item_value: string }>>`
        SELECT v.item_value
        FROM field f
        INNER JOIN field_enum_default ed ON ed.field = f.uuid
        INNER JOIN field_enum_variant v ON v.uuid = ed.variant
        WHERE f.meta = ${this.src} AND f.key = ${this.key}
      `
    )[0]
    return row?.item_value
  }

  /** Список enum-вариантов в порядке объявления. */
  async variants(): Promise<string[]> {
    const rows = await this.sql<Array<{ item_value: string }>>`
      SELECT v.item_value
      FROM field f
      INNER JOIN field_enum_variant v ON v.field = f.uuid
      WHERE f.meta = ${this.src} AND f.key = ${this.key}
      ORDER BY v.position
    `
    return rows.map((row) => row.item_value)
  }
}

const buildField = (sql: SQL, src: string, key: FieldKey, type: FieldType): Field => {
  switch (type) {
    case "string":
      return new StringField(sql, src, key)
    case "number":
      return new NumberField(sql, src, key)
    case "boolean":
      return new BooleanField(sql, src, key)
    case "array":
      return new ArrayField(sql, src, key)
    case "enum":
      return new EnumField(sql, src, key)
  }
}

/** Django-style manager для коллекции `field` одной меты. */
export class Fields {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
  ) {}

  /** Все поля декларации в порядке объявления — каждый инстанс под своим типом. */
  async all(): Promise<Field[]> {
    const rows = await this.sql<Array<{ key: string; type: FieldType }>>`
      SELECT key, type FROM field WHERE meta = ${this.src} ORDER BY rowid
    `
    return rows.map((row) => buildField(this.sql, this.src, row.key, row.type))
  }

  /** Одно поле по ключу — точный подкласс по `field.type`. */
  async get(filter: { key: FieldKey }): Promise<Field | null> {
    const row = (
      await this.sql<Array<{ type: FieldType }>>`
        SELECT type FROM field WHERE meta = ${this.src} AND key = ${filter.key} LIMIT 1
      `
    )[0]
    return row ? buildField(this.sql, this.src, filter.key, row.type) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM field WHERE meta = ${this.src}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM field WHERE meta = ${this.src} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
