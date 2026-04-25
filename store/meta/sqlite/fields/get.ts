import type { Database } from "bun:sqlite"
import type { FieldRow, GetFieldsResult, MetaFieldSchema } from "./get.t.ts"

export const getFields = (db: Database, src: string): GetFieldsResult => {
  const fieldRows = db.query(`SELECT uuid, key, type, required, label FROM field WHERE meta = ? ORDER BY rowid`).all(src) as FieldRow[]
  const defaultFieldIds = new Set(
    (
      db.query(
        `SELECT field_default.field AS field
         FROM field_default
         INNER JOIN field ON field.uuid = field_default.field
         WHERE field.meta = ?`,
      ).all(src) as Array<{ field: string }>
    ).map((row) => row.field),
  )

  const stringDefaults = new Map(
    (
      db.query(
        `SELECT field_string_default.field AS field, field_string_default.default_value AS default_value
         FROM field_string_default
         INNER JOIN field ON field.uuid = field_string_default.field
         WHERE field.meta = ?`,
      ).all(src) as Array<{ field: string; default_value: string }>
    ).map((row) => [row.field, row.default_value]),
  )

  const numberDefaults = new Map(
    (
      db.query(
        `SELECT field_number_default.field AS field, field_number_default.default_value AS default_value
         FROM field_number_default
         INNER JOIN field ON field.uuid = field_number_default.field
         WHERE field.meta = ?`,
      ).all(src) as Array<{ field: string; default_value: number }>
    ).map((row) => [row.field, row.default_value]),
  )

  const booleanDefaults = new Map(
    (
      db.query(
        `SELECT field_boolean_default.field AS field, field_boolean_default.default_value AS default_value
         FROM field_boolean_default
         INNER JOIN field ON field.uuid = field_boolean_default.field
         WHERE field.meta = ?`,
      ).all(src) as Array<{ field: string; default_value: number }>
    ).map((row) => [row.field, row.default_value === 1]),
  )

  const arrayDefaultRows = db.query(
    `SELECT field_array_default_item.field AS field, field_array_default_item.item_value AS item_value
     FROM field_array_default_item
     INNER JOIN field ON field.uuid = field_array_default_item.field
     WHERE field.meta = ?
     ORDER BY field_array_default_item.position`,
  ).all(src) as Array<{ field: string; item_value: string }>

  const arrayDefaults = new Map<string, number[]>()
  for (const row of arrayDefaultRows) {
    const items = arrayDefaults.get(row.field) ?? []
    items.push(Number(row.item_value))
    arrayDefaults.set(row.field, items)
  }

  const enumVariantRows = db.query(
    `SELECT field_enum_variant.uuid AS uuid, field_enum_variant.field AS field, field_enum_variant.item_value AS item_value
     FROM field_enum_variant
     INNER JOIN field ON field.uuid = field_enum_variant.field
     WHERE field.meta = ?
     ORDER BY field_enum_variant.position`,
  ).all(src) as Array<{ uuid: string; field: string; item_value: string }>

  const enumValues = new Map<string, string[]>()
  const enumVariants = new Map<string, string>()
  for (const row of enumVariantRows) {
    const values = enumValues.get(row.field) ?? []
    values.push(row.item_value)
    enumValues.set(row.field, values)
    enumVariants.set(row.uuid, row.item_value)
  }

  const enumDefaults = new Map(
    (
      db.query(
        `SELECT field_enum_default.field AS field, field_enum_variant.item_value AS item_value
         FROM field_enum_default
         INNER JOIN field ON field.uuid = field_enum_default.field
         INNER JOIN field_enum_variant ON field_enum_variant.uuid = field_enum_default.variant
         WHERE field.meta = ?`,
      ).all(src) as Array<{ field: string; item_value: string }>
    ).map((row) => [row.field, row.item_value]),
  )

  const fields: GetFieldsResult["fields"] = {}
  const fieldKeys = new Map<string, string>()

  for (const row of fieldRows) {
    fieldKeys.set(row.uuid, row.key)

    const field = { type: row.type } as unknown as MetaFieldSchema
    if (row.required === 1) field.required = true
    if (row.label !== null) field.label = row.label

    if (defaultFieldIds.has(row.uuid)) {
      if (row.type === "string" && stringDefaults.has(row.uuid)) field.default = stringDefaults.get(row.uuid)
      if (row.type === "number" && numberDefaults.has(row.uuid)) field.default = numberDefaults.get(row.uuid)
      if (row.type === "boolean" && booleanDefaults.has(row.uuid)) field.default = booleanDefaults.get(row.uuid)
      if (row.type === "array") field.default = arrayDefaults.get(row.uuid) ?? []
      if (row.type === "enum" && enumDefaults.has(row.uuid)) field.default = enumDefaults.get(row.uuid)
    }

    if (row.type === "enum") {
      field.values = enumValues.get(row.uuid) ?? []
    }

    fields[row.key] = field
  }

  return { fields, fieldKeys, enumVariants }
}
