/**
 * Сущность `actor_value` — связь (actor, field) → value.
 *
 * Entanglement выражен через разделение записи `value`: если две строки
 * `actor_value` указывают на один `value.uuid`, акторы запутаны автоматически.
 *
 * Якорный файл сущности — под ним группируются:
 * - `actor_value.sql` — DDL (actor FK CASCADE, field FK→field.uuid CASCADE,
 *   value FK→value.uuid RESTRICT; PK (actor, field))
 * - `actor_value.G.ts` — Get (readActorValue по (actor,field), listValueOwners
 *   для проверки entanglement)
 * - `actor_value.U.ts` — Update (shareValue связать с другой записью, forkValue
 *   расщепить shared)
 */

export {}
