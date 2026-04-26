import type { Database } from "bun:sqlite"

/**
 * Удаляет актора, его связи (`actor_value`, `actor_state` уходят по каскаду)
 * и orphan-записи value, на которые после удаления больше никто не ссылается.
 */
export const deleteActor = (db: Database, uuid: string): void => {
  const collectStmt = db.prepare(`SELECT value FROM actor_value WHERE actor = ?`)
  const deleteActorStmt = db.prepare(`DELETE FROM actor WHERE uuid = ?`)
  const deleteOrphanValueStmt = db.prepare(
    `DELETE FROM value WHERE uuid = ? AND NOT EXISTS (SELECT 1 FROM actor_value WHERE value = uuid)`,
  )

  db.transaction(() => {
    const oldValueIds = (collectStmt.all(uuid) as Array<{ value: string }>).map((r) => r.value)
    deleteActorStmt.run(uuid)
    for (const valueId of oldValueIds) {
      deleteOrphanValueStmt.run(valueId)
    }
  })()
}
