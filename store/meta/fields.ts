import type { SQL } from "bun"
import type { FieldDefinition, FieldKey } from "../../metafor.t.ts"
import type { GetFieldsResult } from "./sqlite/fields.t.ts"
import { getFields } from "./sqlite"

/** Одна декларированная запись поля. */
export interface FieldRecord {
  key: FieldKey
  schema: FieldDefinition
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
  async all(): Promise<FieldRecord[]> {
    const result = await getFields(this.sql, this.src)
    return Object.entries(result.fields).map(([key, schema]) => ({ key, schema }))
  }

  /** Одно поле по ключу. */
  async get(filter: { key: FieldKey }): Promise<FieldRecord | null> {
    const result = await getFields(this.sql, this.src)
    const schema = result.fields[filter.key]
    return schema === undefined ? null : { key: filter.key, schema }
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
