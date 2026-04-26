import type { Database } from "bun:sqlite"
import { generateUuid } from "./_helpers.ts"

/**
 * Связывает актор-поле с существующей записью value (entanglement).
 * Если у actor-поля уже была запись и она orphan-нулась — удаляется (каскад
 * снимет данные из всех типизированных value_<kind> и value_list_item_*).
 */
export const shareValue = async (db: Database, actor: string, metaField: string, value: string): Promise<void> => {
  const deleteOrphanValueStmt = db.prepare(
    `DELETE FROM value WHERE uuid = ? AND NOT EXISTS (SELECT 1 FROM actor_value WHERE value = uuid)`,
  )
  db.transaction(() => {
    const oldRow = db
      .prepare(`SELECT value FROM actor_value WHERE actor = ? AND metaField = ?`)
      .get(actor, metaField) as { value: string } | null
    const oldValueId = oldRow?.value
    db.prepare(
      `INSERT INTO actor_value (actor, metaField, value) VALUES (?, ?, ?)
       ON CONFLICT (actor, metaField) DO UPDATE SET value = excluded.value`,
    ).run(actor, metaField, value)
    if (oldValueId !== undefined && oldValueId !== value) {
      deleteOrphanValueStmt.run(oldValueId)
    }
  })()
}

/**
 * Расщепляет shared value: создаёт новую копию записи value (со всеми
 * типизированными подтаблицами и list-item-ами) под одного актор-поле,
 * остальные акторы продолжают делить старую. Возвращает новый uuid value.
 */
export const forkValue = async (db: Database, actor: string, metaField: string): Promise<string> => {
  const newUuid = generateUuid()

  db.transaction(() => {
    const sharedRow = db
      .prepare(`SELECT value FROM actor_value WHERE actor = ? AND metaField = ?`)
      .get(actor, metaField) as { value: string } | null
    if (!sharedRow) {
      throw new Error(`actor_value (${actor}, ${metaField}) not found — cannot fork`)
    }
    const sourceUuid = sharedRow.value

    // копируем корневую value-запись
    const rootRow = db.prepare(`SELECT kind FROM value WHERE uuid = ?`).get(sourceUuid) as { kind: string } | null
    if (!rootRow) throw new Error(`source value ${sourceUuid} missing`)
    db.prepare(`INSERT INTO value (uuid, kind) VALUES (?, ?)`).run(newUuid, rootRow.kind)

    // копируем содержимое типизированной подтаблицы (если она есть для kind)
    switch (rootRow.kind) {
      case "boolean": {
        const r = db.prepare(`SELECT boolean FROM value_boolean WHERE value = ?`).get(sourceUuid) as
          | { boolean: number }
          | null
        if (r) db.prepare(`INSERT INTO value_boolean (value, boolean) VALUES (?, ?)`).run(newUuid, r.boolean)
        break
      }
      case "number": {
        const r = db.prepare(`SELECT number FROM value_number WHERE value = ?`).get(sourceUuid) as
          | { number: number }
          | null
        if (r) db.prepare(`INSERT INTO value_number (value, number) VALUES (?, ?)`).run(newUuid, r.number)
        break
      }
      case "string": {
        const r = db.prepare(`SELECT text FROM value_string WHERE value = ?`).get(sourceUuid) as { text: string } | null
        if (r) db.prepare(`INSERT INTO value_string (value, text) VALUES (?, ?)`).run(newUuid, r.text)
        break
      }
      case "enum": {
        const r = db.prepare(`SELECT variant FROM value_enum WHERE value = ?`).get(sourceUuid) as
          | { variant: string }
          | null
        if (r) db.prepare(`INSERT INTO value_enum (value, variant) VALUES (?, ?)`).run(newUuid, r.variant)
        break
      }
      case "list": {
        // копируем все list-item записи через все типизированные подтаблицы
        const itemRoots = db
          .prepare(`SELECT position, kind FROM value_list_item WHERE value = ?`)
          .all(sourceUuid) as Array<{ position: number; kind: string }>
        const insertItemRoot = db.prepare(`INSERT INTO value_list_item (value, position, kind) VALUES (?, ?, ?)`)
        for (const item of itemRoots) {
          insertItemRoot.run(newUuid, item.position, item.kind)
          switch (item.kind) {
            case "boolean": {
              const r = db
                .prepare(`SELECT boolean FROM value_list_item_boolean WHERE value = ? AND position = ?`)
                .get(sourceUuid, item.position) as { boolean: number } | null
              if (r)
                db.prepare(`INSERT INTO value_list_item_boolean (value, position, boolean) VALUES (?, ?, ?)`).run(
                  newUuid,
                  item.position,
                  r.boolean,
                )
              break
            }
            case "number": {
              const r = db
                .prepare(`SELECT number FROM value_list_item_number WHERE value = ? AND position = ?`)
                .get(sourceUuid, item.position) as { number: number } | null
              if (r)
                db.prepare(`INSERT INTO value_list_item_number (value, position, number) VALUES (?, ?, ?)`).run(
                  newUuid,
                  item.position,
                  r.number,
                )
              break
            }
            case "string": {
              const r = db
                .prepare(`SELECT text FROM value_list_item_string WHERE value = ? AND position = ?`)
                .get(sourceUuid, item.position) as { text: string } | null
              if (r)
                db.prepare(`INSERT INTO value_list_item_string (value, position, text) VALUES (?, ?, ?)`).run(
                  newUuid,
                  item.position,
                  r.text,
                )
              break
            }
            case "enum": {
              const r = db
                .prepare(`SELECT variant FROM value_list_item_enum WHERE value = ? AND position = ?`)
                .get(sourceUuid, item.position) as { variant: string } | null
              if (r)
                db.prepare(`INSERT INTO value_list_item_enum (value, position, variant) VALUES (?, ?, ?)`).run(
                  newUuid,
                  item.position,
                  r.variant,
                )
              break
            }
            // для 'null' дополнительная подтаблица отсутствует
          }
        }
        break
      }
      // для 'null' дополнительная подтаблица отсутствует
    }

    // переключаем actor_value на новую запись
    db.prepare(`UPDATE actor_value SET value = ? WHERE actor = ? AND metaField = ?`).run(newUuid, actor, metaField)
  })()

  return newUuid
}
