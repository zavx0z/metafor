/**
 * Finally-вариант процесса в DSL-relational схеме.
 *
 * Subset сущности `process` с типом `'finally'` — лёгкий процесс с одним
 * `before`-handler-ом и набором reads.
 *
 * Якорный файл сущности — под ним группируются:
 * - `finally.sql` — DDL (process_finally, process_finally_read)
 *
 * Логика записи для finally хранится внутри `process.C.ts`, чтения — в `read.ts`
 * (они общие для action и finally, расходятся по `process.type`).
 */

export {}
