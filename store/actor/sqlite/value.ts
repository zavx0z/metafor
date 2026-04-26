/**
 * Сущность `value` (+ `value_item` для list-значений) — глобальные записи значений,
 * могут разделяться несколькими акторами через `actor_value` (entanglement).
 *
 * Якорный файл сущности — под ним группируются:
 * - `value.sql` — DDL (2 таблицы: value, value_item; FK на field_enum_variant)
 * - `value.G.ts` — Get (readValue, readValueItems)
 * - `value.U.ts` — Update (setValue scalar, writeValueItem upsert, truncateValueItems)
 */

export {}
