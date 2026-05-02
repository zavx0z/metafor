import type {FieldKey} from "../../../metafor.t.ts"
import type {Wimp} from "./wimp.ts"
import type {FieldType} from "./field.ts"
import {StringField} from "./field.string.ts"
import {NumberField} from "./field.number.ts"
import {BooleanField} from "./field.boolean.ts"
import {ArrayField} from "./field.array.ts"
import {EnumField} from "./field.enum.ts"

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

  /**
   * Низкоуровневый INSERT в `field`. Не обрабатывает default/variants —
   * это ответственность caller через возвращённый ORM.
   */
  async add(input: {
    key: FieldKey
    type: FieldType
    required?: boolean | undefined
    label?: string | null | undefined
  }): Promise<AnyField> {
    const uuid = crypto.randomUUID()
    await this.wimp.sql`
        INSERT INTO field (uuid, wimp, key, type, required, label)
        VALUES (${uuid}, ${this.wimp.src}, ${input.key}, ${input.type},
                ${input.required ? 1 : 0}, ${input.label ?? null})
    `
    return buildField(this, input.key, input.type)
  }

  async string(input: {
    key: FieldKey
    default?: string | undefined
    label?: string | null | undefined
    required?: boolean | undefined
  }): Promise<StringField> {
    const field = (await this.add({
      key: input.key,
      type: "string",
      required: input.required,
      label: input.label,
    })) as StringField
    if (input.default !== undefined) await field.setDefault(input.default)
    return field
  }

  async number(input: {
    key: FieldKey
    default?: number | undefined
    label?: string | null | undefined
    required?: boolean | undefined
  }): Promise<NumberField> {
    const field = (await this.add({
      key: input.key,
      type: "number",
      required: input.required,
      label: input.label,
    })) as NumberField
    if (input.default !== undefined) await field.setDefault(input.default)
    return field
  }

  async boolean(input: {
    key: FieldKey
    default?: boolean | undefined
    label?: string | null | undefined
    required?: boolean | undefined
  }): Promise<BooleanField> {
    const field = (await this.add({
      key: input.key,
      type: "boolean",
      required: input.required,
      label: input.label,
    })) as BooleanField
    if (input.default !== undefined) await field.setDefault(input.default)
    return field
  }

  async array(input: {
    key: FieldKey
    default?: number[] | undefined
    label?: string | null | undefined
    required?: boolean | undefined
  }): Promise<ArrayField> {
    const field = (await this.add({
      key: input.key,
      type: "array",
      required: input.required,
      label: input.label,
    })) as ArrayField
    if (input.default !== undefined) await field.setDefault(input.default)
    return field
  }

  async enum(input: {
    key: FieldKey
    values: ReadonlyArray<string | number>
    default?: string | number | undefined
    label?: string | null | undefined
    required?: boolean | undefined
  }): Promise<EnumField> {
    const field = (await this.add({
      key: input.key,
      type: "enum",
      required: input.required,
      label: input.label,
    })) as EnumField
    for (const value of input.values) {
      await field.variants.add(value)
    }
    if (input.default !== undefined) await field.setDefault(input.default)
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
