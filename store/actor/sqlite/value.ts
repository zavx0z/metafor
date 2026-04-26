/**
 * Сущность `value` — глобальные записи значений, могут разделяться несколькими
 * акторами через `actor_value` (entanglement).
 *
 * Применён тот же паттерн, что и для `field_default` в meta-схеме:
 * - корневая таблица — только uuid + kind (дискриминатор)
 * - скалярные подтаблицы `value_<kind>` per type
 * - `value_list_item` — плоская таблица с `item_value TEXT NOT NULL`
 *   (по аналогии с `field_array_default_item`); тип элемента восстанавливается
 *   рантаймом через meta-схему родительского поля.
 *
 * Якорный файл сущности — под ним группируются:
 * - `value.sql` — DDL (6 таблиц: value + 4 скалярных + value_list_item)
 * - `value.t.ts` — типы (Scalar, ValueRecord — discriminated union, ValueItemRecord)
 * - `value.G.ts` — Get (readValue с LEFT JOIN, readValueItems)
 * - `value.U.ts` — Update (setValue, writeValueItem, truncateValueItems)
 */

export {}
