/**
 * Bun-sqlite реализация actor-стора.
 *
 * Корневой entry-point — **классы** ORM-уровня (`Actor` / `ActorChildren` /
 * `ActorRoots` / `ActorValues` / `ActorFieldValue` / `Value` (abstract) +
 * 6 type-specific подклассов). Read-логика инлайнена в классах точечными
 * raw-SQL-запросами; write-логика (транзакционные C/D/U-операции) —
 * в `*.C.ts` / `*.D.ts` / `*.U.ts` рядом с якорными файлами сущностей.
 *
 * Открытие БД и применение схемы — ответственность caller-а
 * (см. `store/server.ts`), потому что одна SQL держит таблицы обоих
 * пакетов (meta + actor).
 *
 * Симметрично с `@store/meta/sqlite`.
 */

import type { SQL } from "bun"
import type { ActorRows } from "./actor.t.ts"

import { writeActorRows } from "./actor.C.ts"
import { deleteActor } from "./actor.D.ts"
import { setActorState } from "./state.U.ts"
import { forkValue, shareValue } from "./actor_value.U.ts"
import { setValue, truncateValueItems, writeValueItem } from "./value.U.ts"

import { actorSchemaSql, actorTableNames } from "./schema.ts"

/** Полный DDL actor-схемы (5 таблиц + индексы). Применяется к открытой SQL. */
export { actorSchemaSql }

// ────────────────────────────── ORM-классы ──────────────────────────────

export { Actor, ActorChildren, ActorRoots, ActorValues } from "./actor.ts"
export { ActorFieldValue } from "./actor_value.ts"
export { BooleanValue, EnumValue, ListValue, NullValue, NumberValue, StringValue, Value } from "./value.ts"

// ────────────────────────────── write-side helpers (server.ts API) ──────────────────────────────

import type { Scalar, ValueItemRecord } from "./value.t.ts"

/** Записывает row-group актора одной транзакцией: actor + values + value-records + value-items + state. */
export const actorCreate = async (sql: SQL, rows: ActorRows): Promise<void> => writeActorRows(sql, rows)

/** Удаляет актора и orphan-value (на которые больше никто не ссылается). Каскад FK снимет actor_value/actor_state. */
export const actorDelete = async (sql: SQL, uuid: string): Promise<void> => deleteActor(sql, uuid)

/** Очищает все actor-таблицы. */
export const actorReset = async (sql: SQL): Promise<void> => {
  await sql.begin(async (tx) => {
    for (const table of actorTableNames) {
      await tx.unsafe(`DELETE FROM ${table}`)
    }
  })
}

/** Меняет содержимое записи value (касается всех акторов, разделяющих её). Транзакция: kind + подтаблицы. */
export const valueSet = async (sql: SQL, uuid: string, scalar: Scalar | { kind: "list" }): Promise<void> =>
  setValue(sql, uuid, scalar)

/** Записывает / обновляет один элемент списочного значения по позиции. */
export const valueItemsWrite = async (sql: SQL, value: string, position: number, itemValue: string): Promise<void> =>
  writeValueItem(sql, value, position, itemValue)

/** Удаляет хвост списочного значения начиная с указанной позиции. */
export const valueItemsTruncate = async (sql: SQL, value: string, fromPosition: number): Promise<void> =>
  truncateValueItems(sql, value, fromPosition)

/** Меняет состояние FSM актора (upsert). */
export const stateSet = async (sql: SQL, actor: string, metaState: string): Promise<void> =>
  setActorState(sql, actor, metaState)

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

// re-export для server.ts/потребителей, нуждающихся в ValueItemRecord на write-API
export type { ValueItemRecord }
