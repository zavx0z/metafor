import type { Database } from "bun:sqlite"
import type { ActorRecord, ActorRows } from "./actor.t.ts"
import type { ValueRecord } from "./value.t.ts"

/** Создаёт пустую запись `actor` (без связанных value/state). */
export const createActor = async (db: Database, actor: ActorRecord): Promise<void> => {
  db.prepare(`INSERT INTO actor (uuid, parent, meta, position) VALUES (?, ?, ?, ?)`).run(
    actor.uuid,
    actor.parent,
    actor.meta,
    actor.position,
  )
}

/** Очищает скалярные подтаблицы для одной value-записи (перед сменой kind). */
const clearValueScalarTables = (db: Database, uuid: string): void => {
  db.prepare(`DELETE FROM value_boolean WHERE value = ?`).run(uuid)
  db.prepare(`DELETE FROM value_number WHERE value = ?`).run(uuid)
  db.prepare(`DELETE FROM value_string WHERE value = ?`).run(uuid)
  db.prepare(`DELETE FROM value_enum WHERE value = ?`).run(uuid)
}

/** Записывает скалярную часть value в типизированную подтаблицу. null/list — без подтаблицы. */
const writeValueScalar = (db: Database, value: ValueRecord): void => {
  switch (value.kind) {
    case "null":
    case "list":
      return
    case "boolean":
      db.prepare(`INSERT INTO value_boolean (value, boolean) VALUES (?, ?)`).run(value.uuid, value.boolean ? 1 : 0)
      return
    case "number":
      db.prepare(`INSERT INTO value_number (value, number) VALUES (?, ?)`).run(value.uuid, value.number)
      return
    case "string":
      db.prepare(`INSERT INTO value_string (value, text) VALUES (?, ?)`).run(value.uuid, value.text)
      return
    case "enum":
      db.prepare(`INSERT INTO value_enum (value, variant) VALUES (?, ?)`).run(value.uuid, value.variant)
      return
  }
}

/**
 * Записывает row-group актора одной транзакцией.
 *
 * Удаляет предыдущую версию актора (каскад снимет `actor_value`/`actor_state`),
 * вставляет новый набор записей: actor + value + value_<kind> + value_list_item +
 * actor_value + actor_state. Подчищает orphan-value, на которые после удаления
 * никто не ссылается.
 */
export const writeActorRows = async (db: Database, rows: ActorRows): Promise<void> => {
  const insertActorStmt = db.prepare(`INSERT INTO actor (uuid, parent, meta, position) VALUES (?, ?, ?, ?)`)
  const upsertValueRootStmt = db.prepare(
    `INSERT INTO value (uuid, kind) VALUES (?, ?)
     ON CONFLICT (uuid) DO UPDATE SET kind = excluded.kind`,
  )
  const upsertValueListItemStmt = db.prepare(
    `INSERT INTO value_list_item (value, position, item_value) VALUES (?, ?, ?)
     ON CONFLICT (value, position) DO UPDATE SET item_value = excluded.item_value`,
  )
  const insertActorValueStmt = db.prepare(`INSERT INTO actor_value (actor, metaField, value) VALUES (?, ?, ?)`)
  const insertActorStateStmt = db.prepare(`INSERT INTO actor_state (actor, metaState) VALUES (?, ?)`)
  const deleteOrphanValueStmt = db.prepare(
    `DELETE FROM value WHERE uuid = ? AND NOT EXISTS (SELECT 1 FROM actor_value WHERE value = uuid)`,
  )
  const deleteListItemsStmt = db.prepare(`DELETE FROM value_list_item WHERE value = ?`)
  const collectStmt = db.prepare(`SELECT value FROM actor_value WHERE actor = ?`)
  const deleteActorStmt = db.prepare(`DELETE FROM actor WHERE uuid = ?`)

  db.transaction(() => {
    // удалить актора целиком (каскад снесёт actor_value, actor_state; orphan-value подчистим ниже)
    const oldValueIds = (collectStmt.all(rows.actor.uuid) as Array<{ value: string }>).map((r) => r.value)
    deleteActorStmt.run(rows.actor.uuid)

    // вставить актора
    insertActorStmt.run(rows.actor.uuid, rows.actor.parent, rows.actor.meta, rows.actor.position)

    // value-записи: upsert корня + типизированная подтаблица
    for (const v of rows.valueRecords) {
      upsertValueRootStmt.run(v.uuid, v.kind)
      clearValueScalarTables(db, v.uuid)
      writeValueScalar(db, v)
    }

    // value_list_item: переписать набор для каждой list-value-записи
    const listValueIds = new Set(rows.valueRecords.filter((v) => v.kind === "list").map((v) => v.uuid))
    for (const valueId of listValueIds) {
      deleteListItemsStmt.run(valueId)
    }
    for (const item of rows.valueItems) {
      upsertValueListItemStmt.run(item.value, item.position, item.itemValue)
    }

    // связи actor_value
    for (const av of rows.values) {
      insertActorValueStmt.run(av.actor, av.metaField, av.value)
    }

    // состояние
    insertActorStateStmt.run(rows.state.actor, rows.state.metaState)

    // подчистить orphan-value (которые после удаления актора больше никем не делятся)
    for (const valueId of oldValueIds) {
      deleteOrphanValueStmt.run(valueId)
    }
  })()
}
