import type { SQL } from "bun"
import type { FieldDefinition, FieldKey } from "../../metafor.t.ts"
import type { GetFieldsResult } from "./sqlite/fields.t.ts"
import { getFields } from "./sqlite"

/**
 * Один инстанс поля декларации. Хранит только `(sql, src, key)`; полная
 * декларация загружается лениво методом `schema()`.
 */
export class Field {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
    readonly key: FieldKey,
  ) {}

  /** Полная декларация поля. Бросает, если поле исчезло из меты. */
  async schema(): Promise<FieldDefinition> {
    const result = await getFields(this.sql, this.src)
    const schema = result.fields[this.key]
    if (schema === undefined) throw new Error(`field ${this.key} not found in meta ${this.src}`)
    return schema
  }
}

/**
 * Django-style manager для коллекции `field` одной меты.
 * Каждый метод — отдельный SELECT в БД (без кеша).
 */
export class Fields {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
  ) {}

  /** Все поля декларации, в порядке объявления. */
  async all(): Promise<Field[]> {
    const result = await getFields(this.sql, this.src)
    return Object.keys(result.fields).map((key) => new Field(this.sql, this.src, key))
  }

  /** Одно поле по ключу. */
  async get(filter: { key: FieldKey }): Promise<Field | null> {
    const result = await getFields(this.sql, this.src)
    return result.fields[filter.key] === undefined ? null : new Field(this.sql, this.src, filter.key)
  }

  /** Число полей. */
  async count(): Promise<number> {
    const result = await getFields(this.sql, this.src)
    return Object.keys(result.fields).length
  }

  /** Хотя бы одно поле есть? */
  async exists(): Promise<boolean> {
    const result = await getFields(this.sql, this.src)
    return Object.keys(result.fields).length > 0
  }

  /**
   * Внутренний доступ к raw-результату (для зависимых manager-ов, которым
   * нужны fieldKeys / enumVariants). Каждый вызов — свежий SELECT.
   */
  raw(): Promise<GetFieldsResult> {
    return getFields(this.sql, this.src)
  }
}
