/**
 * Bun-sqlite реализация actor-стора.
 *
 * Функциональный API: каждая операция — функция, первым аргументом принимающая
 * `Database`. Открытие БД и применение схемы — ответственность caller-а
 * (см. `store/server.ts`), потому что одна Database держит таблицы обоих
 * пакетов (meta + actor).
 *
 * Симметрично с `@store/meta/sqlite`.
 */

import type { Database } from "bun:sqlite"
import type { ActorRecord, ActorRows } from "./actor.t.ts"
import type { ActorStateRecord } from "./state.t.ts"
import type { ActorValueRecord } from "./actor_value.t.ts"
import type { Scalar, ValueItemRecord, ValueRecord } from "./value.t.ts"

import { writeActorRows } from "./actor.C.ts"
import { listChildActors, listRootActors, readActor, readActorRows } from "./actor.G.ts"
import { deleteActor } from "./actor.D.ts"
import { readActorState } from "./state.G.ts"
import { setActorState } from "./state.U.ts"
import { listValueOwners, readActorValue } from "./actor_value.G.ts"
import { forkValue, shareValue } from "./actor_value.U.ts"
import { readValue, readValueItems } from "./value.G.ts"
import { setValue, truncateValueItems, writeValueItem } from "./value.U.ts"

import { actorSchemaSql, actorTableNames } from "./schema.ts"

/** Полный DDL actor-схемы (5 таблиц + индексы). Применяется к открытой Database. */
export { actorSchemaSql }

// ────────────────────────────── корневая сущность actor ──────────────────────────────

/** Записывает row-group актора одной транзакцией: actor + values + value-records + value-items + state. */
export const actorCreate = (db: Database, rows: ActorRows): void => writeActorRows(db, rows)

/** Читает row-group актора. Возвращает `null`, если актор или его state отсутствуют. */
export const actorGet = (db: Database, uuid: string): ActorRows | null => readActorRows(db, uuid)

/** Удаляет актора и orphan-value (на которые больше никто не ссылается). Каскад FK снимет actor_value/actor_state. */
export const actorDelete = (db: Database, uuid: string): void => deleteActor(db, uuid)

/** Базовая запись актора без связанных value/state. */
export const actorHead = (db: Database, uuid: string): ActorRecord | null => readActor(db, uuid)

/** Все корневые акторы (parent IS NULL), упорядочены по `position`. */
export const actorListRoots = (db: Database): ActorRecord[] => listRootActors(db)

/** Все дочерние акторы родителя, упорядочены по `position`. */
export const actorListChildren = (db: Database, parent: string): ActorRecord[] => listChildActors(db, parent)

/** Очищает все actor-таблицы. */
export const actorReset = (db: Database): void => {
  db.transaction(() => {
    for (const table of actorTableNames) {
      db.run(`DELETE FROM ${table}`)
    }
  })()
}

// ────────────────────────────── value (записи значений) ──────────────────────────────

/** Читает запись value по uuid. */
export const valueGet = (db: Database, uuid: string): ValueRecord | null => readValue(db, uuid)

/** Меняет содержимое записи value (касается всех акторов, разделяющих её). */
export const valueSet = (db: Database, uuid: string, scalar: Scalar | { kind: "list" }): void =>
  setValue(db, uuid, scalar)

/** Список акторов, разделяющих эту запись. Длина > 1 = entanglement. */
export const valueOwners = (db: Database, uuid: string): ActorValueRecord[] => listValueOwners(db, uuid)

/** Все элементы списочного значения, упорядочены по `position`. */
export const valueItemsGet = (db: Database, value: string): ValueItemRecord[] => readValueItems(db, value)

/** Записывает / обновляет один элемент списочного значения по позиции. */
export const valueItemsWrite = (db: Database, value: string, position: number, itemValue: string): void =>
  writeValueItem(db, value, position, itemValue)

/** Удаляет хвост списочного значения начиная с указанной позиции. */
export const valueItemsTruncate = (db: Database, value: string, fromPosition: number): void =>
  truncateValueItems(db, value, fromPosition)

// ────────────────────────────── state (FSM-состояние) ──────────────────────────────

/** Читает текущее FSM-состояние актора. */
export const stateGet = (db: Database, actor: string): ActorStateRecord | null => readActorState(db, actor)

/** Меняет состояние FSM актора (upsert). */
export const stateSet = (db: Database, actor: string, metaState: string): void => setActorState(db, actor, metaState)

// ────────────────────────────── link (actor_value junction) ──────────────────────────────

/** Читает связь actor_value по (actor, field). */
export const linkGet = (db: Database, actor: string, field: string): ActorValueRecord | null =>
  readActorValue(db, actor, field)

/**
 * Связывает актор-поле с существующей записью value (entanglement).
 * Если у actor-поля уже была запись и она orphan-нулась — удаляется.
 */
export const linkShare = (db: Database, actor: string, field: string, value: string): void =>
  shareValue(db, actor, field, value)

/**
 * Расщепляет shared value: создаёт новую копию записи value (со всеми подтаблицами и list-item-ами)
 * под одного актор-поле, остальные акторы продолжают делить старую. Возвращает новый uuid value.
 */
export const linkFork = (db: Database, actor: string, field: string): string => forkValue(db, actor, field)
