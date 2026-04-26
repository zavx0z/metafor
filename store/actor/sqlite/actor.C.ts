import type { SQL } from "bun"
import type { ActorRecord, ActorRows } from "./actor.t.ts"
import type { ValueRecord } from "./value.t.ts"

/** Создаёт пустую запись `actor` (без связанных value/state). */
export const createActor = async (sql: SQL, actor: ActorRecord): Promise<void> => {
  await sql`
    INSERT INTO actor (uuid, parent, meta, position)
    VALUES (${actor.uuid}, ${actor.parent}, ${actor.meta}, ${actor.position})
  `
}

/** Очищает скалярные подтаблицы для одной value-записи (перед сменой kind). */
const clearValueScalarTables = async (sql: SQL, uuid: string): Promise<void> => {
  await sql`DELETE FROM value_boolean WHERE value = ${uuid}`
  await sql`DELETE FROM value_number WHERE value = ${uuid}`
  await sql`DELETE FROM value_string WHERE value = ${uuid}`
  await sql`DELETE FROM value_enum WHERE value = ${uuid}`
}

/** Записывает скалярную часть value в типизированную подтаблицу. null/list — без подтаблицы. */
const writeValueScalar = async (sql: SQL, value: ValueRecord): Promise<void> => {
  switch (value.kind) {
    case "null":
    case "list":
      return
    case "boolean":
      await sql`INSERT INTO value_boolean (value, boolean) VALUES (${value.uuid}, ${value.boolean ? 1 : 0})`
      return
    case "number":
      await sql`INSERT INTO value_number (value, number) VALUES (${value.uuid}, ${value.number})`
      return
    case "string":
      await sql`INSERT INTO value_string (value, text) VALUES (${value.uuid}, ${value.text})`
      return
    case "enum":
      await sql`INSERT INTO value_enum (value, variant) VALUES (${value.uuid}, ${value.variant})`
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
export const writeActorRows = async (sql: SQL, rows: ActorRows): Promise<void> => {
  await sql.begin(async (tx) => {
    // удалить актора целиком (каскад снесёт actor_value, actor_state; orphan-value подчистим ниже)
    const collected = await tx<Array<{ value: string }>>`SELECT value FROM actor_value WHERE actor = ${rows.actor.uuid}`
    const oldValueIds = collected.map((r) => r.value)
    await tx`DELETE FROM actor WHERE uuid = ${rows.actor.uuid}`

    // вставить актора
    await tx`
      INSERT INTO actor (uuid, parent, meta, position)
      VALUES (${rows.actor.uuid}, ${rows.actor.parent}, ${rows.actor.meta}, ${rows.actor.position})
    `

    // value-записи: upsert корня + типизированная подтаблица
    for (const v of rows.valueRecords) {
      await tx`
        INSERT INTO value (uuid, kind) VALUES (${v.uuid}, ${v.kind})
        ON CONFLICT (uuid) DO UPDATE SET kind = excluded.kind
      `
      await clearValueScalarTables(tx, v.uuid)
      await writeValueScalar(tx, v)
    }

    // value_list_item: переписать набор для каждой list-value-записи
    const listValueIds = new Set(rows.valueRecords.filter((v) => v.kind === "list").map((v) => v.uuid))
    for (const valueId of listValueIds) {
      await tx`DELETE FROM value_list_item WHERE value = ${valueId}`
    }
    for (const item of rows.valueItems) {
      await tx`
        INSERT INTO value_list_item (value, position, item_value) VALUES (${item.value}, ${item.position}, ${item.itemValue})
        ON CONFLICT (value, position) DO UPDATE SET item_value = excluded.item_value
      `
    }

    // связи actor_value
    for (const av of rows.values) {
      await tx`INSERT INTO actor_value (actor, field, value) VALUES (${av.actor}, ${av.field}, ${av.value})`
    }

    // состояние
    await tx`INSERT INTO actor_state (actor, metaState) VALUES (${rows.state.actor}, ${rows.state.metaState})`

    // подчистить orphan-value (которые после удаления актора больше никем не делятся)
    for (const valueId of oldValueIds) {
      await tx`
        DELETE FROM value WHERE uuid = ${valueId} AND NOT EXISTS (SELECT 1 FROM actor_value WHERE value = uuid)
      `
    }
  })
}
