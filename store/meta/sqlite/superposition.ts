/**
 * FSM сущности `superposition` + `transition` + `condition` (+ predicate, list_item)
 * в DSL-relational схеме.
 *
 * Якорный файл сущности — под ним группируются:
 * - `superposition.sql` — DDL (5 таблиц: superposition, transition, condition,
 *   condition_predicate, condition_list_item)
 * - `superposition.t.ts` — типы (PredicateRow, ConditionListItemRow, FieldUuidByKey,
 *   StateUuidByName)
 * - `superposition.C.ts` — `createSuperposition(db, meta, src, fieldUuids)`
 * - `superposition.G.ts` — `getSuperposition(db, src, enumVariants)`
 */

export {}
