import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../.."
import { relationMetafor } from "./metafor"
import { relationFields } from "./fields"
import { relationSuperposition } from "./superposition"
import { relationProcess } from "./process"
import { relationReactions } from "./reactions"
import { relationMatter } from "./matter"

/**
 * Экспортирует структуру MetaDSL в реляционные таблицы SQLite.
 *
 * @param db - Экземпляр базы данных SQLite.
 * @param meta - Объект MetaDSL.
 * @param src - Уникальный идентификатор (source) атома.
 */
export function relation(db: Database, meta: MetaDSL, src: string): void {
  db.transaction(() => {
    relationMetafor(db, meta, src)
    const fieldUuids = relationFields(db, meta, src)
    const stateUuids = relationSuperposition(db, meta, src, fieldUuids)
    relationProcess(db, meta, src, fieldUuids)
    relationReactions(db, meta, src, fieldUuids, stateUuids)
    relationMatter(db, meta, src, fieldUuids)
  })()
}
