/**
 * Сущность `value` — глобальные записи значений, могут разделяться несколькими
 * акторами через `actor_value` (entanglement).
 *
 * Таблицы:
 * - `value` — корень: только uuid + kind (дискриминатор)
 * - `value_boolean` / `value_number` / `value_string` / `value_enum` —
 *   типизированные подтаблицы, по одной колонке нативного типа на каждую.
 *   Принадлежность value к подтаблице определяется значением `value.kind`.
 *   Для kind='null' и kind='list' своей подтаблицы нет.
 * - `value_list_item` — корневая таблица элементов list-значения (только kind)
 * - `value_list_item_<kind>` — типизированные подтаблицы элементов
 *
 * Якорный файл сущности — под ним группируются:
 * - `value.sql` — DDL (9 таблиц)
 * - `value.t.ts` — типы (Scalar, ValueRecord, ValueItemRecord — discriminated union)
 * - `value.G.ts` — Get (readValue, readValueItems с LEFT JOIN по подтаблицам)
 * - `value.U.ts` — Update (setValue, writeValueItem, truncateValueItems)
 */

export {}
