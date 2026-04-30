import type {SQL} from "bun"
import type {ActorValueRecord} from "./actor_value.t.ts"
import type {ValueItemRecord, ValueKind} from "./value.t.ts"

export abstract class Value {
  constructor(
    protected readonly sql: SQL,
    readonly uuid: string,
  ) {}

  abstract readonly kind: ValueKind

  async owners(): Promise<ActorValueRecord[]> {
    const rows = await this.sql<Array<{ actor: string; field: string; value: string }>>`
      SELECT actor, field, value FROM actor_value WHERE value = ${this.uuid}
    `
    return rows.map((row) => ({actor: String(row.actor), field: String(row.field), value: String(row.value)}))
  }

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

export class NullValue extends Value {
  readonly kind = "null" as const
}

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
}

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
}

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
}

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
}

export class ListValue extends Value {
  readonly kind = "list" as const

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
}

export type AnyValue = NullValue | BooleanValue | NumberValue | StringValue | EnumValue | ListValue

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
