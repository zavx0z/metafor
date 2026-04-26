import type { Database } from "bun:sqlite"
import type { Scalar } from "./value.t.ts"
import { scalarColumns, type ScalarLike } from "./_helpers.ts"

/**
 * Меняет содержимое записи value (касается всех акторов, разделяющих её).
 * Для `kind === "list"` обнуляет скалярные колонки (элементы хранятся в `value_item`).
 */
export const setValue = async (
  db: Database,
  uuid: string,
  scalar: Scalar | { kind: "list" },
): Promise<void> => {
  const cols = scalarColumns({ kind: scalar.kind, ...(scalar.kind !== "list" ? scalar : {}) } as ScalarLike)
  db.prepare(
    `UPDATE value SET kind = ?, boolean = ?, number = ?, text = ?, variant = ? WHERE uuid = ?`,
  ).run(scalar.kind, cols.boolean, cols.number, cols.text, cols.variant, uuid)
}

/** Записывает/обновляет элемент списочного значения по позиции. */
export const writeValueItem = async (
  db: Database,
  value: string,
  position: number,
  item: Scalar,
): Promise<void> => {
  const cols = scalarColumns(item)
  db.prepare(
    `INSERT INTO value_item (value, position, kind, boolean, number, text, variant) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (value, position) DO UPDATE SET kind=excluded.kind, boolean=excluded.boolean, number=excluded.number, text=excluded.text, variant=excluded.variant`,
  ).run(value, position, item.kind, cols.boolean, cols.number, cols.text, cols.variant)
}

/** Удаляет хвост списочного значения (для shrink). */
export const truncateValueItems = async (
  db: Database,
  value: string,
  fromPosition: number,
): Promise<void> => {
  db.prepare(`DELETE FROM value_item WHERE value = ? AND position >= ?`).run(value, fromPosition)
}
