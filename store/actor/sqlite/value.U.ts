import type { Database } from "bun:sqlite"
import type { Scalar } from "./value.t.ts"

/**
 * Очищает все типизированные подтаблицы для одной value-записи.
 * Используется перед сменой kind, чтобы не оставить запись в подтаблице
 * несоответствующего типа.
 */
const clearValueScalarTables = (db: Database, uuid: string): void => {
  db.prepare(`DELETE FROM value_boolean WHERE value = ?`).run(uuid)
  db.prepare(`DELETE FROM value_number WHERE value = ?`).run(uuid)
  db.prepare(`DELETE FROM value_string WHERE value = ?`).run(uuid)
  db.prepare(`DELETE FROM value_enum WHERE value = ?`).run(uuid)
}

/**
 * Записывает скалярное содержимое value в соответствующую типизированную
 * подтаблицу. `kind === 'null'` или `'list'` — никакой подтаблицы не пишется.
 */
const writeValueScalar = (db: Database, uuid: string, scalar: Scalar | { kind: "list" }): void => {
  switch (scalar.kind) {
    case "null":
    case "list":
      return
    case "boolean":
      db.prepare(`INSERT INTO value_boolean (value, boolean) VALUES (?, ?)`).run(uuid, scalar.boolean ? 1 : 0)
      return
    case "number":
      db.prepare(`INSERT INTO value_number (value, number) VALUES (?, ?)`).run(uuid, scalar.number)
      return
    case "string":
      db.prepare(`INSERT INTO value_string (value, text) VALUES (?, ?)`).run(uuid, scalar.text)
      return
    case "enum":
      db.prepare(`INSERT INTO value_enum (value, variant) VALUES (?, ?)`).run(uuid, scalar.variant)
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
export const setValue = async (db: Database, uuid: string, scalar: Scalar | { kind: "list" }): Promise<void> => {
  db.transaction(() => {
    db.prepare(`UPDATE value SET kind = ? WHERE uuid = ?`).run(scalar.kind, uuid)
    clearValueScalarTables(db, uuid)
    writeValueScalar(db, uuid, scalar)
  })()
}

/**
 * Записывает / обновляет один элемент списочного значения по позиции.
 * `itemValue` — уже сериализованное представление; сериализация на стороне рантайма.
 */
export const writeValueItem = async (
  db: Database,
  value: string,
  position: number,
  itemValue: string,
): Promise<void> => {
  db.prepare(
    `INSERT INTO value_list_item (value, position, item_value) VALUES (?, ?, ?)
     ON CONFLICT (value, position) DO UPDATE SET item_value = excluded.item_value`,
  ).run(value, position, itemValue)
}

/** Удаляет хвост списочного значения начиная с указанной позиции. */
export const truncateValueItems = async (db: Database, value: string, fromPosition: number): Promise<void> => {
  db.prepare(`DELETE FROM value_list_item WHERE value = ? AND position >= ?`).run(value, fromPosition)
}
