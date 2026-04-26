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
 * ORM-классы `Field` / `Fields` — в этом файле; используют точечные SELECT-ы
 * по `(meta, key)` и не дёргают bulk-loader `getFields`.
 */

import type { SQL } from "bun"
import type { FieldKey } from "../../../metafor.t.ts"
import type { MetaFieldSchema } from "./fields.t.ts"

type FieldType = MetaFieldSchema["type"]

/**
 * Один инстанс поля декларации. Хранит только `(sql, src, key)`; каждое
 * свойство — отдельный getter (или setter для простых скаляров `required` /
 * `label`). Композитные данные (`default`) тянутся одним SQL с LEFT JOIN-ами.
 */
export class Field {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
    readonly key: FieldKey,
  ) {}

  /** Тип поля (`string` / `number` / `boolean` / `array` / `enum`). */
  async type(): Promise<FieldType> {
    const row = (
      await this.sql<Array<{ type: FieldType }>>`
        SELECT type FROM field WHERE meta = ${this.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.src}`)
    return row.type
  }

  /** Required-флаг (`required NOT NULL` в БД, default 0). */
  async required(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ required: number }>>`
        SELECT required FROM field WHERE meta = ${this.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.src}`)
    return row.required === 1
  }

  /** Изменить required-флаг. */
  async setRequired(value: boolean): Promise<void> {
    await this.sql`
      UPDATE field SET required = ${value ? 1 : 0}
      WHERE meta = ${this.src} AND key = ${this.key}
    `
  }

  /** Человекочитаемая метка (или `undefined`, если не задана). */
  async label(): Promise<string | undefined> {
    const row = (
      await this.sql<Array<{ label: string | null }>>`
        SELECT label FROM field WHERE meta = ${this.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.src}`)
    return row.label ?? undefined
  }

  /** Изменить label (`null` сбрасывает). */
  async setLabel(value: string | null): Promise<void> {
    await this.sql`
      UPDATE field SET label = ${value}
      WHERE meta = ${this.src} AND key = ${this.key}
    `
  }

  /**
   * Default-значение поля. Тип результата зависит от `type` поля:
   * - `string` → `string`
   * - `number` → `number`
   * - `boolean` → `boolean`
   * - `enum` → `string` (имя варианта)
   * - `array` → `number[]`
   *
   * `undefined`, если default не задан. Один композитный SELECT с LEFT JOIN-ами
   * по всем таблицам defaults: лишние NULL-колонки отбрасываются по `type`.
   */
  async default(): Promise<string | number | boolean | number[] | undefined> {
    type Row = {
      type: FieldType
      string_default: string | null
      number_default: number | null
      boolean_default: number | null
      enum_default: string | null
      array_defaults: string | null
    }
    const row = (
      await this.sql<Row[]>`
        SELECT
          f.type AS type,
          sd.default_value AS string_default,
          nd.default_value AS number_default,
          bd.default_value AS boolean_default,
          ev.item_value AS enum_default,
          (SELECT json_group_array(item_value)
           FROM (SELECT item_value FROM field_array_default_item
                 WHERE field = f.uuid
                 ORDER BY position)) AS array_defaults
        FROM field f
        LEFT JOIN field_string_default sd ON sd.field = f.uuid
        LEFT JOIN field_number_default nd ON nd.field = f.uuid
        LEFT JOIN field_boolean_default bd ON bd.field = f.uuid
        LEFT JOIN field_enum_default ed ON ed.field = f.uuid
        LEFT JOIN field_enum_variant ev ON ev.uuid = ed.variant
        WHERE f.meta = ${this.src} AND f.key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.src}`)

    switch (row.type) {
      case "string":
        return row.string_default ?? undefined
      case "number":
        return row.number_default ?? undefined
      case "boolean":
        return row.boolean_default === null ? undefined : row.boolean_default === 1
      case "enum":
        return row.enum_default ?? undefined
      case "array": {
        if (!row.array_defaults) return undefined
        const items = JSON.parse(row.array_defaults) as string[]
        if (items.length === 0) return undefined
        return items.map(Number)
      }
    }
  }

  /** Список enum-вариантов (пустой, если `type !== 'enum'`). */
  async variants(): Promise<string[]> {
    const rows = await this.sql<Array<{ item_value: string }>>`
      SELECT v.item_value
      FROM field_enum_variant v
      INNER JOIN field f ON f.uuid = v.field
      WHERE f.meta = ${this.src} AND f.key = ${this.key}
      ORDER BY v.position
    `
    return rows.map((row) => row.item_value)
  }
}

/** Django-style manager для коллекции `field` одной меты. */
export class Fields {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
  ) {}

  /** Все поля декларации, в порядке объявления. */
  async all(): Promise<Field[]> {
    const rows = await this.sql<Array<{ key: string }>>`
      SELECT key FROM field WHERE meta = ${this.src} ORDER BY rowid
    `
    return rows.map((row) => new Field(this.sql, this.src, row.key))
  }

  /** Одно поле по ключу. */
  async get(filter: { key: FieldKey }): Promise<Field | null> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM field WHERE meta = ${this.src} AND key = ${filter.key} LIMIT 1
      `
    )[0]
    return row ? new Field(this.sql, this.src, filter.key) : null
  }

  /** Число полей. */
  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM field WHERE meta = ${this.src}
      `
    )[0]
    return row?.count ?? 0
  }

  /** Хотя бы одно поле есть? */
  async exists(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM field WHERE meta = ${this.src} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
