import type { Database } from "bun:sqlite"
import type { ActorRecord, ActorRows } from "./actor.t.ts"
import { scalarColumns } from "./_helpers.ts"

/** Создаёт пустую запись `actor` (без связанных value/state). */
export const createActor = async (db: Database, actor: ActorRecord): Promise<void> => {
  db.prepare(`INSERT INTO actor (uuid, parent, meta, position) VALUES (?, ?, ?, ?)`).run(
    actor.uuid,
    actor.parent,
    actor.meta,
    actor.position,
  )
}

/**
 * Записывает row-group актора одной транзакцией.
 *
 * Удаляет предыдущую версию актора (каскад снимет `actor_value`/`actor_state`),
 * вставляет новый набор `value`/`value_item`/`actor_value`/`actor_state`,
 * подчищает orphan-value, на которые после удаления никто не ссылается.
 */
export const writeActorRows = async (db: Database, rows: ActorRows): Promise<void> => {
  const insertActorStmt = db.prepare(`INSERT INTO actor (uuid, parent, meta, position) VALUES (?, ?, ?, ?)`)
  const insertValueItemStmt = db.prepare(
    `INSERT INTO value_item (value, position, kind, boolean, number, text, variant) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertActorValueStmt = db.prepare(`INSERT INTO actor_value (actor, metaField, value) VALUES (?, ?, ?)`)
  const insertActorStateStmt = db.prepare(`INSERT INTO actor_state (actor, metaState) VALUES (?, ?)`)
  const deleteOrphanValueStmt = db.prepare(
    `DELETE FROM value WHERE uuid = ? AND NOT EXISTS (SELECT 1 FROM actor_value WHERE value = uuid)`,
  )
  const upsertValueStmt = db.prepare(
    `INSERT INTO value (uuid, kind, boolean, number, text, variant) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (uuid) DO UPDATE SET kind=excluded.kind, boolean=excluded.boolean, number=excluded.number, text=excluded.text, variant=excluded.variant`,
  )
  const deleteValueItemsStmt = db.prepare(`DELETE FROM value_item WHERE value = ?`)
  const collectStmt = db.prepare(`SELECT value FROM actor_value WHERE actor = ?`)
  const deleteActorStmt = db.prepare(`DELETE FROM actor WHERE uuid = ?`)

  db.transaction(() => {
    // удалить актора целиком (каскад снесёт actor_value, actor_state; orphan-value подчистим ниже)
    const oldValueIds = (collectStmt.all(rows.actor.uuid) as Array<{ value: string }>).map((r) => r.value)
    deleteActorStmt.run(rows.actor.uuid)

    // вставить актора
    insertActorStmt.run(rows.actor.uuid, rows.actor.parent, rows.actor.meta, rows.actor.position)

    // вставить value-записи (UPSERT — если такая запись уже существует от другого актора, не пересоздаём)
    for (const v of rows.valueRecords) {
      const cols = scalarColumns(v)
      upsertValueStmt.run(v.uuid, v.kind, cols.boolean, cols.number, cols.text, cols.variant)
    }

    // value_item: переписать набор для каждой записи
    const valueIdsToReplaceItems = new Set(rows.valueRecords.filter((v) => v.kind === "list").map((v) => v.uuid))
    for (const valueId of valueIdsToReplaceItems) {
      deleteValueItemsStmt.run(valueId)
    }
    for (const item of rows.valueItems) {
      const cols = scalarColumns(item)
      insertValueItemStmt.run(item.value, item.position, item.kind, cols.boolean, cols.number, cols.text, cols.variant)
    }

    // вставить связи actor_value
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
