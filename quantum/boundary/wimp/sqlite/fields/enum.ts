import {Field} from "./field.ts"
import type {Fields} from "./index.ts"

export class EnumVariant {
  constructor(
    readonly field: EnumField,
    readonly value: string,
  ) {
  }

  async id(): Promise<number> {
    const fieldId = await this.field.id()
    const row = (
      await this.field.fieldsRef.wimp.sql<Array<{ id: number }>>`
          SELECT id
          FROM field_enum_variant
          WHERE field = ${fieldId}
            AND item_value = ${this.value}
          LIMIT 1
      `
    )[0]
    if (!row) {
      throw new Error(`enum variant "${this.value}" not found in field "${this.field.key}"`)
    }
    return row.id
  }

  async position(): Promise<number> {
    const fieldId = await this.field.id()
    const row = (
      await this.field.fieldsRef.wimp.sql<Array<{ position: number }>>`
          SELECT position
          FROM field_enum_variant
          WHERE field = ${fieldId}
            AND item_value = ${this.value}
          LIMIT 1
      `
    )[0]
    if (!row) {
      throw new Error(`enum variant "${this.value}" not found in field "${this.field.key}"`)
    }
    return row.position
  }
}

export class EnumVariants {
  constructor(readonly field: EnumField) {
  }

  async add(value: string | number): Promise<EnumVariant> {
    const stringValue = String(value)
    const fieldId = await this.field.id()
    const sql = this.field.fieldsRef.wimp.sql

    const existing = (
      await sql<Array<{ id: number }>>`
          SELECT id
          FROM field_enum_variant
          WHERE field = ${fieldId}
            AND item_value = ${stringValue}
          LIMIT 1
      `
    )[0]
    if (existing) return new EnumVariant(this.field, stringValue)

    const posRow = (
      await sql<Array<{ next: number }>>`
          SELECT COALESCE(MAX(position) + 1, 0) AS next
          FROM field_enum_variant
          WHERE field = ${fieldId}
      `
    )[0]
    const position = posRow?.next ?? 0
    await sql`
        INSERT INTO field_enum_variant (field, position, item_value)
        VALUES (${fieldId}, ${position}, ${stringValue})
    `
    return new EnumVariant(this.field, stringValue)
  }

  async get(filter: { value: string }): Promise<EnumVariant | null> {
    const fieldId = await this.field.id()
    const row = (
      await this.field.fieldsRef.wimp.sql<Array<{ item_value: string }>>`
          SELECT item_value
          FROM field_enum_variant
          WHERE field = ${fieldId}
            AND item_value = ${filter.value}
          LIMIT 1
      `
    )[0]
    return row ? new EnumVariant(this.field, row.item_value) : null
  }

  async all(): Promise<EnumVariant[]> {
    const fieldId = await this.field.id()
    const rows = await this.field.fieldsRef.wimp.sql<Array<{ item_value: string }>>`
        SELECT item_value
        FROM field_enum_variant
        WHERE field = ${fieldId}
        ORDER BY position
    `
    return rows.map((row) => new EnumVariant(this.field, row.item_value))
  }

  async count(): Promise<number> {
    const fieldId = await this.field.id()
    const row = (
      await this.field.fieldsRef.wimp.sql<Array<{ count: number }>>`
          SELECT COUNT(*) AS count
          FROM field_enum_variant
          WHERE field = ${fieldId}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const fieldId = await this.field.id()
    const row = (
      await this.field.fieldsRef.wimp.sql<Array<{ ok: number }>>`
          SELECT 1 AS ok
          FROM field_enum_variant
          WHERE field = ${fieldId}
          LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}

export class EnumField extends Field {
  readonly type = "enum" as const
  readonly variants: EnumVariants

  constructor(fields: Fields, key: string) {
    super(fields, key)
    this.variants = new EnumVariants(this)
  }

  /** Доступ к Fields-родителю для sub-ORM (`fields` в Field protected). */
  get fieldsRef(): Fields {
    return this.fields
  }

  async variantId(value: string): Promise<number | null> {
    const row = (
      await this.fields.wimp.sql<Array<{ id: number }>>`
          SELECT v.id
          FROM field f
                   INNER JOIN field_enum_variant v ON v.field = f.id
          WHERE f.wimp = ${this.fields.wimp.src}
            AND f.key = ${this.key}
            AND v.item_value = ${value}
          LIMIT 1
      `
    )[0]
    return row?.id ?? null
  }

  async default(): Promise<string | undefined> {
    const row = (
      await this.fields.wimp.sql<Array<{ item_value: string }>>`
          SELECT v.item_value
          FROM field f
                   INNER JOIN field_enum_default ed ON ed.field = f.id
                   INNER JOIN field_enum_variant v ON v.id = ed.variant
          WHERE f.wimp = ${this.fields.wimp.src}
            AND f.key = ${this.key}
      `
    )[0]
    return row?.item_value
  }

  async setDefault(value: string | number): Promise<void> {
    const stringValue = String(value)
    const variant = await this.variants.get({value: stringValue})
    if (!variant) {
      throw new Error(`EnumField.setDefault: variant "${stringValue}" not registered for field "${this.key}"`)
    }
    const variantId = await variant.id()
    const fieldId = await this.id()
    await this.ensureDefaultRow(fieldId)
    const sql = this.fields.wimp.sql
    await sql`DELETE FROM field_enum_default WHERE field = ${fieldId}`
    await sql`INSERT INTO field_enum_default (field, variant) VALUES (${fieldId}, ${variantId})`
  }
}
