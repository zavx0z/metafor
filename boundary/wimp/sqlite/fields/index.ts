import type {FieldKey} from "../../../../metafor.t.ts"
import type {Wimp} from "../wimp.ts"
import type {FieldType} from "./field.ts"
import {StringField} from "./string.ts"
import {NumberField} from "./number.ts"
import {BooleanField} from "./boolean.ts"
import {ArrayField} from "./array.ts"
import {EnumField} from "./enum.ts"

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
  readonly #wimp: Wimp

  constructor(wimp: Wimp) {
    this.#wimp = wimp
  }

  get wimp(): Wimp {
    return this.#wimp
  }

  async add(
    type: FieldType,
    input: {
      key: FieldKey
      default?: unknown
      values?: ReadonlyArray<string | number>
      label?: string | null | undefined
      required?: boolean | undefined
    },
  ): Promise<AnyField> {
    await this.wimp.sql`
        INSERT INTO field (uuid, wimp, key, type, required, label)
        VALUES (${crypto.randomUUID()}, ${this.wimp.src}, ${input.key}, ${type},
                ${input.required ? 1 : 0}, ${input.label ?? null})
    `
    const field = buildField(this, input.key, type)
    if (field.type === "enum" && input.values !== undefined) {
      for (const value of input.values) {
        await field.variants.add(value)
      }
    }
    if (input.default !== undefined) {
      switch (field.type) {
        case "string":
          await field.setDefault(input.default as string)
          break
        case "number":
          await field.setDefault(input.default as number)
          break
        case "boolean":
          await field.setDefault(input.default as boolean)
          break
        case "array":
          await field.setDefault(input.default as number[])
          break
        case "enum":
          await field.setDefault(input.default as string | number)
          break
      }
    }
    return field
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
