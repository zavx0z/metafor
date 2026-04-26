import type { Database } from "bun:sqlite"
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
 * Memoization внутри инстанса: первый `.all()/.get()/.count()/.exists()`
 * делает SELECT, остальные используют кеш.
 */
export class Fields {
  private cache?: GetFieldsResult
  constructor(
    private readonly db: Database,
    private readonly src: string,
  ) {}

  private load(): GetFieldsResult {
    return (this.cache ??= getFields(this.db, this.src))
  }

  /** Все поля декларации, в порядке объявления. */
  all(): FieldRecord[] {
    return Object.entries(this.load().fields).map(([key, schema]) => ({ key, schema }))
  }

  /** Одно поле по ключу. */
  get(filter: { key: FieldKey }): FieldRecord | null {
    const schema = this.load().fields[filter.key]
    return schema === undefined ? null : { key: filter.key, schema }
  }

  /** Число полей. */
  count(): number {
    return Object.keys(this.load().fields).length
  }

  /** Хотя бы одно поле есть? */
  exists(): boolean {
    return Object.keys(this.load().fields).length > 0
  }

  /**
   * Внутренний доступ к raw-результату (нужен другим manager-ам, которым
   * нужны fieldKeys/enumVariants для зависимых запросов).
   */
  raw(): GetFieldsResult {
    return this.load()
  }
}
