/**
 * Сущность `field` + варианты + defaults в DSL-relational схеме.
 *
 * Якорный файл сущности — под ним группируются:
 * - `fields.sql` — DDL (8 таблиц: field, field_default, field_<type>_default,
 *   field_array_default_item, field_enum_variant, field_enum_default)
 * - `fields.t.ts` — типы (FieldRow, MetaFieldSchema, GetFieldsResult, FieldUuidByKey)
 * - `fields.C.ts` — `createFields(db, meta, src)`
 * - `fields.G.ts` — `getFields(db, src)`
 */

export {}
