import type { Database } from "bun:sqlite"
import type { Scalar } from "./value.t.ts"

/**
 * Очищает все типизированные подтаблицы для одной value-записи.
 * Используется перед сменой kind или перед удалением, чтобы не оставить
 * записи в подтаблице несоответствующего типа.
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
 * Для `'list'` элементы (`value_list_item_*`) НЕ затрагиваются — они живут отдельно.
 */
export const setValue = async (db: Database, uuid: string, scalar: Scalar | { kind: "list" }): Promise<void> => {
  db.transaction(() => {
    db.prepare(`UPDATE value SET kind = ? WHERE uuid = ?`).run(scalar.kind, uuid)
    clearValueScalarTables(db, uuid)
    writeValueScalar(db, uuid, scalar)
  })()
}

/**
 * Записывает скалярное содержимое одного элемента списка в соответствующую
 * типизированную подтаблицу. `kind === 'null'` — без записи в подтаблицу.
 */
const writeValueListItemScalar = (db: Database, value: string, position: number, item: Scalar): void => {
  switch (item.kind) {
    case "null":
      return
    case "boolean":
      db.prepare(
        `INSERT INTO value_list_item_boolean (value, position, boolean) VALUES (?, ?, ?)
         ON CONFLICT (value, position) DO UPDATE SET boolean = excluded.boolean`,
      ).run(value, position, item.boolean ? 1 : 0)
      return
    case "number":
      db.prepare(
        `INSERT INTO value_list_item_number (value, position, number) VALUES (?, ?, ?)
         ON CONFLICT (value, position) DO UPDATE SET number = excluded.number`,
      ).run(value, position, item.number)
      return
    case "string":
      db.prepare(
        `INSERT INTO value_list_item_string (value, position, text) VALUES (?, ?, ?)
         ON CONFLICT (value, position) DO UPDATE SET text = excluded.text`,
      ).run(value, position, item.text)
      return
    case "enum":
      db.prepare(
        `INSERT INTO value_list_item_enum (value, position, variant) VALUES (?, ?, ?)
         ON CONFLICT (value, position) DO UPDATE SET variant = excluded.variant`,
      ).run(value, position, item.variant)
      return
  }
}

/** Очищает типизированные подтаблицы list-item для конкретной (value, position). */
const clearValueListItemTables = (db: Database, value: string, position: number): void => {
  db.prepare(`DELETE FROM value_list_item_boolean WHERE value = ? AND position = ?`).run(value, position)
  db.prepare(`DELETE FROM value_list_item_number  WHERE value = ? AND position = ?`).run(value, position)
  db.prepare(`DELETE FROM value_list_item_string  WHERE value = ? AND position = ?`).run(value, position)
  db.prepare(`DELETE FROM value_list_item_enum    WHERE value = ? AND position = ?`).run(value, position)
}

/**
 * Записывает / обновляет один элемент списочного значения по позиции.
 * Транзакция: upsert в корневой `value_list_item` (kind), очистка старых
 * типизированных строк, INSERT в нужную типизированную подтаблицу.
 */
export const writeValueItem = async (
  db: Database,
  value: string,
  position: number,
  item: Scalar,
): Promise<void> => {
  db.transaction(() => {
    db.prepare(
      `INSERT INTO value_list_item (value, position, kind) VALUES (?, ?, ?)
       ON CONFLICT (value, position) DO UPDATE SET kind = excluded.kind`,
    ).run(value, position, item.kind)
    clearValueListItemTables(db, value, position)
    writeValueListItemScalar(db, value, position, item)
  })()
}

/**
 * Удаляет хвост списочного значения начиная с указанной позиции.
 * Каскад FK снимает строки в типизированных подтаблицах автоматически.
 */
export const truncateValueItems = async (db: Database, value: string, fromPosition: number): Promise<void> => {
  db.prepare(`DELETE FROM value_list_item WHERE value = ? AND position >= ?`).run(value, fromPosition)
}
