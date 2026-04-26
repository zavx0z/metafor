/**
 * Action-вариант процесса в DSL-relational схеме.
 *
 * Subset сущности `process` с типом `'action'` — содержит исходники action/success/error
 * handler-ов и поля reads/writes по фазам.
 *
 * Якорный файл сущности — под ним группируются:
 * - `action.sql` — DDL (process_action, process_action_read, process_action_write)
 *
 * Логика записи для action хранится внутри `process.C.ts`, чтения — в `read.ts`
 * (они общие для action и finally, расходятся по `process.type`).
 */

export {}
