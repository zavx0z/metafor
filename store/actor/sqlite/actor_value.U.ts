import type { Database } from "bun:sqlite"
import { generateUuid } from "./_helpers.ts"

/**
 * Связывает актор-поле с существующей записью value (entanglement).
 * Если у actor-поля уже была запись и она orphan-нулась — удаляется.
 */
export const shareValue = async (
  db: Database,
  actor: string,
  metaField: string,
  value: string,
): Promise<void> => {
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
 * Расщепляет shared value: создаёт новую копию записи value под одного актор-поле,
 * остальные продолжают делить старую. Возвращает новый uuid value.
 */
export const forkValue = async (db: Database, actor: string, metaField: string): Promise<string> => {
  const newUuid = generateUuid()
  const insertValueStmt = db.prepare(
    `INSERT INTO value (uuid, kind, boolean, number, text, variant) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const insertValueItemStmt = db.prepare(
    `INSERT INTO value_item (value, position, kind, boolean, number, text, variant) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )

  db.transaction(() => {
    const sharedRow = db
      .prepare(`SELECT value FROM actor_value WHERE actor = ? AND metaField = ?`)
      .get(actor, metaField) as { value: string } | null
    if (!sharedRow) {
      throw new Error(`actor_value (${actor}, ${metaField}) not found — cannot fork`)
    }
    // копируем value-запись
    const sourceValue = db
      .prepare(`SELECT kind, boolean, number, text, variant FROM value WHERE uuid = ?`)
      .get(sharedRow.value) as Record<string, unknown> | null
    if (!sourceValue) throw new Error(`source value ${sharedRow.value} missing`)

    insertValueStmt.run(
      newUuid,
      String(sourceValue.kind),
      (sourceValue.boolean as number | null) ?? null,
      (sourceValue.number as number | null) ?? null,
      (sourceValue.text as string | null) ?? null,
      (sourceValue.variant as string | null) ?? null,
    )

    if (sourceValue.kind === "list") {
      const items = db
        .prepare(`SELECT position, kind, boolean, number, text, variant FROM value_item WHERE value = ?`)
        .all(sharedRow.value) as Array<Record<string, unknown>>
      for (const it of items) {
        insertValueItemStmt.run(
          newUuid,
          Number(it.position),
          String(it.kind),
          (it.boolean as number | null) ?? null,
          (it.number as number | null) ?? null,
          (it.text as string | null) ?? null,
          (it.variant as string | null) ?? null,
        )
      }
    }

    // переключаем actor_value на новую запись
    db.prepare(`UPDATE actor_value SET value = ? WHERE actor = ? AND metaField = ?`).run(newUuid, actor, metaField)
  })()
  return newUuid
}
