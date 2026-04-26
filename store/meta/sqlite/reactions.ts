/**
 * Сущность `reaction` + reaction_superposition + read/write в DSL-relational схеме.
 *
 * Якорный файл сущности — под ним группируются:
 * - `reactions.sql` — DDL (4 таблицы: reaction, reaction_superposition,
 *   reaction_read, reaction_write)
 * - `reactions.t.ts` — типы (ReactionRow, FieldUuidByKey, StateUuidByName)
 * - `reactions.C.ts` — `createReactions(db, meta, src, fieldUuids, stateUuids)`
 * - `reactions.G.ts` — `getReactions(db, src, fieldKeys)`
 */

export {}
