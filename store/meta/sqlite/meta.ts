/**
 * Сущность `meta` + `meta_mass_value` в DSL-relational схеме.
 *
 * Якорный файл сущности — под ним группируются:
 * - `metafor.sql` — DDL (см. рядом)
 * - `metafor.t.ts` — типы строк (`MetaRow`, `MetaMassValueRow`)
 * - `metafor.C.ts` — функции записи (создание meta + рекурсивный mass)
 * - `metafor.G.ts` — функции чтения (`getMetaRow`, `getMass`, `hasProcesses`, ...)
 *
 * Здесь будут exposed-функции уровня сущности (компоновки C+G), когда понадобятся.
 */

export {}
