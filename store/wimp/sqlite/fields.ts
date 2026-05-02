import type {FieldKey, MetaDSL} from "../../../metafor.t.ts"
import type {Wimp} from "./wimp.ts"

export type FieldType = "string" | "number" | "boolean" | "array" | "enum"

export abstract class Field {
  constructor(
    protected readonly fields: Fields,
    public key: FieldKey,
  ) {
  }

  abstract readonly type: FieldType

  async uuid(): Promise<string> {
    const row = (
      await this.fields.wimp.sql<Array<{ uuid: string }>>`
          SELECT uuid
          FROM field
          WHERE wimp = ${this.fields.wimp.src}
            AND key = ${this.key}
          LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.fields.wimp.src}`)
    return row.uuid
  }

  async setKey(newKey: FieldKey): Promise<void> {
    await this.fields.wimp.sql`
        UPDATE field
        SET key = ${newKey}
        WHERE wimp = ${this.fields.wimp.src}
          AND key = ${this.key}
    `
    this.key = newKey
  }

  async required(): Promise<boolean> {
    const row = (
      await this.fields.wimp.sql<Array<{ required: number }>>`
          SELECT required
          FROM field
          WHERE wimp = ${this.fields.wimp.src}
            AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.fields.wimp.src}`)
    return row.required === 1
  }

  async label(): Promise<string | undefined> {
    const row = (
      await this.fields.wimp.sql<Array<{ label: string | null }>>`
          SELECT label
          FROM field
          WHERE wimp = ${this.fields.wimp.src}
            AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.fields.wimp.src}`)
    return row.label ?? undefined
  }
}

export class StringField extends Field {
  readonly type = "string" as const

  async default(): Promise<string | undefined> {
    const row = (
      await this.fields.wimp.sql<Array<{ default_value: string }>>`
          SELECT sd.default_value
          FROM field f
                   INNER JOIN field_string_default sd ON sd.field = f.uuid
          WHERE f.wimp = ${this.fields.wimp.src}
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
      await this.fields.wimp.sql<Array<{ default_value: number }>>`
          SELECT nd.default_value
          FROM field f
                   INNER JOIN field_number_default nd ON nd.field = f.uuid
          WHERE f.wimp = ${this.fields.wimp.src}
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
      await this.fields.wimp.sql<Array<{ default_value: number }>>`
          SELECT bd.default_value
          FROM field f
                   INNER JOIN field_boolean_default bd ON bd.field = f.uuid
          WHERE f.wimp = ${this.fields.wimp.src}
            AND f.key = ${this.key}
      `
    )[0]
    return row === undefined ? undefined : row.default_value === 1
  }
}

export class ArrayField extends Field {
  readonly type = "array" as const

  async default(): Promise<number[] | undefined> {
    const rows = await this.fields.wimp.sql<Array<{ item_value: string }>>`
        SELECT item.item_value AS item_value
        FROM field f
                 INNER JOIN field_array_default_item item ON item.field = f.uuid
        WHERE f.wimp = ${this.fields.wimp.src}
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
      await this.fields.wimp.sql<Array<{ uuid: string }>>`
          SELECT v.uuid
          FROM field f
                   INNER JOIN field_enum_variant v ON v.field = f.uuid
          WHERE f.wimp = ${this.fields.wimp.src}
            AND f.key = ${this.key}
            AND v.item_value = ${value}
          LIMIT 1
      `
    )[0]
    return row?.uuid ?? null
  }

  async default(): Promise<string | undefined> {
    const row = (
      await this.fields.wimp.sql<Array<{ item_value: string }>>`
          SELECT v.item_value
          FROM field f
                   INNER JOIN field_enum_default ed ON ed.field = f.uuid
                   INNER JOIN field_enum_variant v ON v.uuid = ed.variant
          WHERE f.wimp = ${this.fields.wimp.src}
            AND f.key = ${this.key}
      `
    )[0]
    return row?.item_value
  }

  async variants(): Promise<string[]> {
    const rows = await this.fields.wimp.sql<Array<{ item_value: string }>>`
        SELECT v.item_value
        FROM field f
                 INNER JOIN field_enum_variant v ON v.field = f.uuid
        WHERE f.wimp = ${this.fields.wimp.src}
          AND f.key = ${this.key}
        ORDER BY v.position
    `
    return rows.map((row) => row.item_value)
  }
}

export type AnyField = StringField | NumberField | BooleanField | ArrayField | EnumField

const buildField = (fields: Fields, key: FieldKey, type: FieldType): AnyField => {
  switch (type) {
    case "string":
      return new StringField(fields, key)
    case "number":
      return new NumberField(fields, key)
    case "boolean":
      return new BooleanField(fields, key)
    case "array":
      return new ArrayField(fields, key)
    case "enum":
      return new EnumField(fields, key)
  }
}

export class Fields {
  constructor(readonly wimp: Wimp) {
  }

  async create(dsl: MetaDSL): Promise<void> {
    const sql = this.wimp.sql
    const src = this.wimp.src
    for (const [key, def] of Object.entries(dsl.fields)) {
      const uuid = crypto.randomUUID()

      await sql`
        INSERT INTO field (uuid, wimp, key, type, required, label)
        VALUES (${uuid}, ${src}, ${key}, ${def.type}, ${def.required ? 1 : 0}, ${def.label || null})
      `

      if ("default" in def && def.default !== undefined) {
        await sql`INSERT INTO field_default (field) VALUES (${uuid})`
        if (def.type === "string") {
          await sql`INSERT INTO field_string_default (field, default_value) VALUES (${uuid}, ${def.default as string})`
        } else if (def.type === "number") {
          await sql`INSERT INTO field_number_default (field, default_value) VALUES (${uuid}, ${def.default as number})`
        } else if (def.type === "boolean") {
          await sql`INSERT INTO field_boolean_default (field, default_value) VALUES (${uuid}, ${def.default ? 1 : 0})`
        } else if (def.type === "array" && Array.isArray(def.default)) {
          const defaults = def.default as unknown[]
          for (let i = 0; i < defaults.length; i++) {
            const itemUuid = crypto.randomUUID()
            await sql`
              INSERT INTO field_array_default_item (uuid, field, position, item_value)
              VALUES (${itemUuid}, ${uuid}, ${i}, ${String(defaults[i])})
            `
          }
        }
      }

      if (def.type === "enum" && "values" in def && Array.isArray(def.values)) {
        const variantUuids = new Map<string | number, string>()
        const values = def.values as Array<string | number>
        for (let i = 0; i < values.length; i++) {
          const val = values[i]!
          const variantUuid = crypto.randomUUID()
          variantUuids.set(val, variantUuid)
          await sql`
            INSERT INTO field_enum_variant (uuid, field, position, item_value)
            VALUES (${variantUuid}, ${uuid}, ${i}, ${String(val)})
          `
        }

        if ("default" in def && def.default !== undefined) {
          const variantUuid = variantUuids.get(def.default as string | number)
          if (variantUuid) {
            await sql`INSERT INTO field_enum_default (field, variant) VALUES (${uuid}, ${variantUuid})`
          }
        }
      }
    }
  }

  async all(): Promise<AnyField[]> {
    const rows = await this.wimp.sql<Array<{ key: string; type: FieldType }>>`
        SELECT key, type
        FROM field
        WHERE wimp = ${this.wimp.src}
        ORDER BY rowid
    `
    return rows.map((row) => buildField(this, row.key, row.type))
  }

  async get(filter: { key: FieldKey }): Promise<AnyField | null> {
    const row = (
      await this.wimp.sql<Array<{ type: FieldType }>>`
          SELECT type
          FROM field
          WHERE wimp = ${this.wimp.src}
            AND key = ${filter.key}
          LIMIT 1
      `
    )[0]
    return row ? buildField(this, filter.key, row.type) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.wimp.sql<Array<{ count: number }>>`
          SELECT COUNT(*) AS count
          FROM field
          WHERE wimp = ${this.wimp.src}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.wimp.sql<Array<{ ok: number }>>`
          SELECT 1 AS ok
          FROM field
          WHERE wimp = ${this.wimp.src}
          LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
