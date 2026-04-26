/**
 * Сущность `process` (action / finally) с reads/writes per phase в DSL-relational схеме.
 *
 * Якорный файл сущности — под ним группируются:
 * - `process.sql` — общая часть (process, process_env)
 * - `process.action.sql` — process_action + reads/writes
 * - `process.finally.sql` — process_finally + reads
 * - `process.t.ts` — типы (ProcessRow, ProcessActionRow, ProcessActionReadRow,
 *   ProcessActionWriteRow, FieldUuidByKey)
 * - `process.C.ts` — `createProcess(db, meta, src, fieldUuids)`
 * - `process.G.ts` — `getProcesses(db, src, fieldKeys)`
 */

export {}
