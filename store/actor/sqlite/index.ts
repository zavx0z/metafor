/**
 * Bun-sqlite реализация actor-стора.
 *
 * Функциональный API: каждая операция — функция, первым аргументом принимающая
 * `SQL`. Открытие БД и применение схемы — ответственность caller-а
 * (см. `store/server.ts`), потому что одна SQL держит таблицы обоих
 * пакетов (meta + actor).
 *
 * Симметрично с `@store/meta/sqlite`.
 */

import type { SQL } from "bun"
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

/** Полный DDL actor-схемы (5 таблиц + индексы). Применяется к открытой SQL. */
export { actorSchemaSql }

// ────────────────────────────── корневая сущность actor ──────────────────────────────

/** Записывает row-group актора одной транзакцией: actor + values + value-records + value-items + state. */
export const actorCreate = async (sql: SQL, rows: ActorRows): Promise<void> => writeActorRows(sql, rows)

/** Читает row-group актора. Возвращает `null`, если актор или его state отсутствуют. */
export const actorGet = async (sql: SQL, uuid: string): Promise<ActorRows | null> => readActorRows(sql, uuid)

/** Удаляет актора и orphan-value (на которые больше никто не ссылается). Каскад FK снимет actor_value/actor_state. */
export const actorDelete = async (sql: SQL, uuid: string): Promise<void> => deleteActor(sql, uuid)

/** Базовая запись актора без связанных value/state. */
export const actorHead = async (sql: SQL, uuid: string): Promise<ActorRecord | null> => readActor(sql, uuid)

/** Все корневые акторы (parent IS NULL), упорядочены по `position`. */
export const actorListRoots = async (sql: SQL): Promise<ActorRecord[]> => listRootActors(sql)

/** Все дочерние акторы родителя, упорядочены по `position`. */
export const actorListChildren = async (sql: SQL, parent: string): Promise<ActorRecord[]> => listChildActors(sql, parent)

/** Очищает все actor-таблицы. */
export const actorReset = async (sql: SQL): Promise<void> => {
  await sql.begin(async (tx) => {
    for (const table of actorTableNames) {
      await tx.unsafe(`DELETE FROM ${table}`)
    }
  })
}

// ────────────────────────────── value (записи значений) ──────────────────────────────

/** Читает запись value по uuid. */
export const valueGet = async (sql: SQL, uuid: string): Promise<ValueRecord | null> => readValue(sql, uuid)

/** Меняет содержимое записи value (касается всех акторов, разделяющих её). */
export const valueSet = async (sql: SQL, uuid: string, scalar: Scalar | { kind: "list" }): Promise<void> =>
  setValue(sql, uuid, scalar)

/** Список акторов, разделяющих эту запись. Длина > 1 = entanglement. */
export const valueOwners = async (sql: SQL, uuid: string): Promise<ActorValueRecord[]> => listValueOwners(sql, uuid)

/** Все элементы списочного значения, упорядочены по `position`. */
export const valueItemsGet = async (sql: SQL, value: string): Promise<ValueItemRecord[]> => readValueItems(sql, value)

/** Записывает / обновляет один элемент списочного значения по позиции. */
export const valueItemsWrite = async (sql: SQL, value: string, position: number, itemValue: string): Promise<void> =>
  writeValueItem(sql, value, position, itemValue)

/** Удаляет хвост списочного значения начиная с указанной позиции. */
export const valueItemsTruncate = async (sql: SQL, value: string, fromPosition: number): Promise<void> =>
  truncateValueItems(sql, value, fromPosition)

// ────────────────────────────── state (FSM-состояние) ──────────────────────────────

/** Читает текущее FSM-состояние актора. */
export const stateGet = async (sql: SQL, actor: string): Promise<ActorStateRecord | null> => readActorState(sql, actor)

/** Меняет состояние FSM актора (upsert). */
export const stateSet = async (sql: SQL, actor: string, metaState: string): Promise<void> => setActorState(sql, actor, metaState)

// ────────────────────────────── link (actor_value junction) ──────────────────────────────

/** Читает связь actor_value по (actor, field). */
export const linkGet = async (sql: SQL, actor: string, field: string): Promise<ActorValueRecord | null> =>
  readActorValue(sql, actor, field)

/**
 * Связывает актор-поле с существующей записью value (entanglement).
 * Если у actor-поля уже была запись и она orphan-нулась — удаляется.
 */
export const linkShare = async (sql: SQL, actor: string, field: string, value: string): Promise<void> =>
  shareValue(sql, actor, field, value)

/**
 * Расщепляет shared value: создаёт новую копию записи value (со всеми подтаблицами и list-item-ами)
 * под одного актор-поле, остальные акторы продолжают делить старую. Возвращает новый uuid value.
 */
export const linkFork = async (sql: SQL, actor: string, field: string): Promise<string> => forkValue(sql, actor, field)
