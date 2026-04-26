/**
 * Сущность `actor` — корневая запись запущенного экземпляра меты.
 *
 * Якорный файл сущности — под ним группируются:
 * - `actor.sql` — DDL (uuid, parent self-FK CASCADE, meta FK→meta.src CASCADE, position)
 * - `actor.C.ts` — Create-операции (writeActorRows, createActor)
 * - `actor.G.ts` — Get-операции (listRoots, listChildren, readActor, readActorRows)
 * - `actor.D.ts` — Delete-операции (deleteActor с orphan-cleanup)
 */

export {}
