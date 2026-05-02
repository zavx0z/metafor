import {Field} from "./field.ts"
import type {Fields} from "./fields.ts"
import type {FieldKey} from "../../../metafor.t.ts"

export class EnumVariant {
  constructor(
    readonly field: EnumField,
    readonly value: string,
  ) {
  }

  async uuid(): Promise<string> {
    const fieldUuid = await this.field.uuid()
    const row = (
      await this.field.fieldsRef.wimp.sql<Array<{ uuid: string }>>`
          SELECT uuid
          FROM field_enum_variant
          WHERE field = ${fieldUuid}
            AND item_value = ${this.value}
          LIMIT 1
      `
    )[0]
    if (!row) {
      throw new Error(`enum variant "${this.value}" not found in field "${this.field.key}"`)
    }
    return row.uuid
  }

  async position(): Promise<number> {
    const fieldUuid = await this.field.uuid()
    const row = (
      await this.field.fieldsRef.wimp.sql<Array<{ position: number }>>`
          SELECT position
          FROM field_enum_variant
          WHERE field = ${fieldUuid}
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
    const fieldUuid = await this.field.uuid()
    const sql = this.field.fieldsRef.wimp.sql

    const existing = (
      await sql<Array<{ uuid: string }>>`
          SELECT uuid
          FROM field_enum_variant
          WHERE field = ${fieldUuid}
            AND item_value = ${stringValue}
          LIMIT 1
      `
    )[0]
    if (existing) return new EnumVariant(this.field, stringValue)

    const posRow = (
      await sql<Array<{ next: number }>>`
          SELECT COALESCE(MAX(position) + 1, 0) AS next
          FROM field_enum_variant
          WHERE field = ${fieldUuid}
      `
    )[0]
    const position = posRow?.next ?? 0
    const variantUuid = crypto.randomUUID()
    await sql`
        INSERT INTO field_enum_variant (uuid, field, position, item_value)
        VALUES (${variantUuid}, ${fieldUuid}, ${position}, ${stringValue})
    `
    return new EnumVariant(this.field, stringValue)
  }

  async get(filter: { value: string }): Promise<EnumVariant | null> {
    const fieldUuid = await this.field.uuid()
    const row = (
      await this.field.fieldsRef.wimp.sql<Array<{ item_value: string }>>`
          SELECT item_value
          FROM field_enum_variant
          WHERE field = ${fieldUuid}
            AND item_value = ${filter.value}
          LIMIT 1
      `
    )[0]
    return row ? new EnumVariant(this.field, row.item_value) : null
  }

  async all(): Promise<EnumVariant[]> {
    const fieldUuid = await this.field.uuid()
    const rows = await this.field.fieldsRef.wimp.sql<Array<{ item_value: string }>>`
        SELECT item_value
        FROM field_enum_variant
        WHERE field = ${fieldUuid}
        ORDER BY position
    `
    return rows.map((row) => new EnumVariant(this.field, row.item_value))
  }

  async count(): Promise<number> {
    const fieldUuid = await this.field.uuid()
    const row = (
      await this.field.fieldsRef.wimp.sql<Array<{ count: number }>>`
          SELECT COUNT(*) AS count
          FROM field_enum_variant
          WHERE field = ${fieldUuid}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const fieldUuid = await this.field.uuid()
    const row = (
      await this.field.fieldsRef.wimp.sql<Array<{ ok: number }>>`
          SELECT 1 AS ok
          FROM field_enum_variant
          WHERE field = ${fieldUuid}
          LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}

export class EnumField extends Field {
  readonly type = "enum" as const
  readonly variants: EnumVariants

  constructor(fields: Fields, key: FieldKey) {
    super(fields, key)
    this.variants = new EnumVariants(this)
  }

  /** Доступ к Fields-родителю для sub-ORM (`fields` в Field protected). */
  get fieldsRef(): Fields {
    return this.fields
  }

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

  async setDefault(value: string | number): Promise<void> {
    const stringValue = String(value)
    const variant = await this.variants.get({value: stringValue})
    if (!variant) {
      throw new Error(`EnumField.setDefault: variant "${stringValue}" not registered for field "${this.key}"`)
    }
    const variantUuid = await variant.uuid()
    const fieldUuid = await this.uuid()
    await this.ensureDefaultRow(fieldUuid)
    const sql = this.fields.wimp.sql
    await sql`DELETE FROM field_enum_default WHERE field = ${fieldUuid}`
    await sql`INSERT INTO field_enum_default (field, variant) VALUES (${fieldUuid}, ${variantUuid})`
  }
}
