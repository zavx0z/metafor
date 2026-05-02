import type {SQL} from "bun"
import type {FieldKey, MetaDSL} from "../../../metafor.t.ts"
import {createFields} from "./fields.C.ts"

export type FieldType = "string" | "number" | "boolean" | "array" | "enum"

export abstract class Field {
  constructor(
    protected readonly sql: SQL,
    protected readonly src: string,
    readonly key: FieldKey,
  ) {
  }

  abstract readonly type: FieldType

  async uuid(): Promise<string> {
    const row = (
      await this.sql<Array<{ uuid: string }>>`
          SELECT uuid
          FROM field
          WHERE wimp = ${this.src}
            AND key = ${this.key}
          LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.src}`)
    return row.uuid
  }

  async required(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ required: number }>>`
          SELECT required
          FROM field
          WHERE wimp = ${this.src}
            AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.src}`)
    return row.required === 1
  }

  async label(): Promise<string | undefined> {
    const row = (
      await this.sql<Array<{ label: string | null }>>`
          SELECT label
          FROM field
          WHERE wimp = ${this.src}
            AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.src}`)
    return row.label ?? undefined
  }
}

export class StringField extends Field {
  readonly type = "string" as const

  async default(): Promise<string | undefined> {
    const row = (
      await this.sql<Array<{ default_value: string }>>`
          SELECT sd.default_value
          FROM field f
                   INNER JOIN field_string_default sd ON sd.field = f.uuid
          WHERE f.wimp = ${this.src}
            AND f.key = ${this.key}
      `
    )[0]
    return row?.default_value
  }
}

export class NumberField extends Field {
  readonly type = "number" as const

  async default(): Promise<number | undefined> {
    const row = (
      await this.sql<Array<{ default_value: number }>>`
          SELECT nd.default_value
          FROM field f
                   INNER JOIN field_number_default nd ON nd.field = f.uuid
          WHERE f.wimp = ${this.src}
            AND f.key = ${this.key}
      `
    )[0]
    return row?.default_value
  }
}

export class BooleanField extends Field {
  readonly type = "boolean" as const

  async default(): Promise<boolean | undefined> {
    const row = (
      await this.sql<Array<{ default_value: number }>>`
          SELECT bd.default_value
          FROM field f
                   INNER JOIN field_boolean_default bd ON bd.field = f.uuid
          WHERE f.wimp = ${this.src}
            AND f.key = ${this.key}
      `
    )[0]
    return row === undefined ? undefined : row.default_value === 1
  }
}

export class ArrayField extends Field {
  readonly type = "array" as const

  async default(): Promise<number[] | undefined> {
    const rows = await this.sql<Array<{ item_value: string }>>`
        SELECT item.item_value AS item_value
        FROM field f
                 INNER JOIN field_array_default_item item ON item.field = f.uuid
        WHERE f.wimp = ${this.src}
          AND f.key = ${this.key}
        ORDER BY item.position
    `
    if (rows.length === 0) return undefined
    return rows.map((row) => Number(row.item_value))
  }
}

export class EnumField extends Field {
  readonly type = "enum" as const

  async variantUuid(value: string): Promise<string | null> {
    const row = (
      await this.sql<Array<{ uuid: string }>>`
          SELECT v.uuid
          FROM field f
                   INNER JOIN field_enum_variant v ON v.field = f.uuid
          WHERE f.wimp = ${this.src}
            AND f.key = ${this.key}
            AND v.item_value = ${value}
          LIMIT 1
      `
    )[0]
    return row?.uuid ?? null
  }

  async default(): Promise<string | undefined> {
    const row = (
      await this.sql<Array<{ item_value: string }>>`
          SELECT v.item_value
          FROM field f
                   INNER JOIN field_enum_default ed ON ed.field = f.uuid
                   INNER JOIN field_enum_variant v ON v.uuid = ed.variant
          WHERE f.wimp = ${this.src}
            AND f.key = ${this.key}
      `
    )[0]
    return row?.item_value
  }

  async variants(): Promise<string[]> {
    const rows = await this.sql<Array<{ item_value: string }>>`
        SELECT v.item_value
        FROM field f
                 INNER JOIN field_enum_variant v ON v.field = f.uuid
        WHERE f.wimp = ${this.src}
          AND f.key = ${this.key}
        ORDER BY v.position
    `
    return rows.map((row) => row.item_value)
  }
}

export type AnyField = StringField | NumberField | BooleanField | ArrayField | EnumField

const buildField = (sql: SQL, src: string, key: FieldKey, type: FieldType): AnyField => {
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

export class Fields {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
  ) {
  }

  async create(dsl: MetaDSL): Promise<void> {
    await createFields(this.sql, dsl, this.src)
  }

  async all(): Promise<AnyField[]> {
    const rows = await this.sql<Array<{ key: string; type: FieldType }>>`
        SELECT key, type
        FROM field
        WHERE wimp = ${this.src}
        ORDER BY rowid
    `
    return rows.map((row) => buildField(this.sql, this.src, row.key, row.type))
  }

  async get(filter: { key: FieldKey }): Promise<AnyField | null> {
    const row = (
      await this.sql<Array<{ type: FieldType }>>`
          SELECT type
          FROM field
          WHERE wimp = ${this.src}
            AND key = ${filter.key}
          LIMIT 1
      `
    )[0]
    return row ? buildField(this.sql, this.src, filter.key, row.type) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{ count: number }>>`
          SELECT COUNT(*) AS count
          FROM field
          WHERE wimp = ${this.src}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
          SELECT 1 AS ok
          FROM field
          WHERE wimp = ${this.src}
          LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
