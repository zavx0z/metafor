import type { SQL } from "bun"
import type { Scalar } from "./value.t.ts"

/**
 * Очищает все типизированные подтаблицы для одной value-записи.
 * Используется перед сменой kind, чтобы не оставить запись в подтаблице
 * несоответствующего типа.
 */
const clearValueScalarTables = async (sql: SQL, uuid: string): Promise<void> => {
  await sql`DELETE FROM value_boolean WHERE value = ${uuid}`
  await sql`DELETE FROM value_number WHERE value = ${uuid}`
  await sql`DELETE FROM value_string WHERE value = ${uuid}`
  await sql`DELETE FROM value_enum WHERE value = ${uuid}`
}

/**
 * Записывает скалярное содержимое value в соответствующую типизированную
 * подтаблицу. `kind === 'null'` или `'list'` — никакой подтаблицы не пишется.
 */
const writeValueScalar = async (sql: SQL, uuid: string, scalar: Scalar | { kind: "list" }): Promise<void> => {
  switch (scalar.kind) {
    case "null":
    case "list":
      return
    case "boolean":
      await sql`INSERT INTO value_boolean (value, boolean) VALUES (${uuid}, ${scalar.boolean ? 1 : 0})`
      return
    case "number":
      await sql`INSERT INTO value_number (value, number) VALUES (${uuid}, ${scalar.number})`
      return
    case "string":
      await sql`INSERT INTO value_string (value, text) VALUES (${uuid}, ${scalar.text})`
      return
    case "enum":
      await sql`INSERT INTO value_enum (value, variant) VALUES (${uuid}, ${scalar.variant})`
      return
  }
}

/**
 * Меняет содержимое записи value (касается всех акторов, разделяющих её).
 *
 * Транзакция: апдейтит `kind` в корневой `value`, очищает старые скалярные
 * подтаблицы (если был другой kind) и пишет новую запись в нужную подтаблицу.
 * Для `'list'` элементы (`value_list_item`) НЕ затрагиваются — они живут отдельно.
 */
export const setValue = async (sql: SQL, uuid: string, scalar: Scalar | { kind: "list" }): Promise<void> => {
  await sql.begin(async (tx) => {
    await tx`UPDATE value SET kind = ${scalar.kind} WHERE uuid = ${uuid}`
    await clearValueScalarTables(tx, uuid)
    await writeValueScalar(tx, uuid, scalar)
  })
}

/**
 * Записывает / обновляет один элемент списочного значения по позиции.
 * `itemValue` — уже сериализованное представление; сериализация на стороне рантайма.
 */
export const writeValueItem = async (
  sql: SQL,
  value: string,
  position: number,
  itemValue: string,
): Promise<void> => {
  await sql`
    INSERT INTO value_list_item (value, position, item_value) VALUES (${value}, ${position}, ${itemValue})
    ON CONFLICT (value, position) DO UPDATE SET item_value = excluded.item_value
  `
}

/** Удаляет хвост списочного значения начиная с указанной позиции. */
export const truncateValueItems = async (sql: SQL, value: string, fromPosition: number): Promise<void> => {
  await sql`DELETE FROM value_list_item WHERE value = ${value} AND position >= ${fromPosition}`
}
