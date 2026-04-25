import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../../.."
import { createMetafor } from "./metafor/create.ts"
import { createFields } from "./fields/create.ts"
import { createSuperposition } from "./superposition/create.ts"
import { createProcess } from "./process/create.ts"
import { createReactions } from "./reactions/create.ts"
import { createMatter } from "./matter/create.ts"

/**
 * Экспортирует структуру MetaDSL в реляционные таблицы SQLite.
 *
 * @param db - Экземпляр базы данных SQLite.
 * @param meta - Объект MetaDSL.
 * @param src - Уникальный идентификатор (source) атома.
 */
export function relation(db: Database, meta: MetaDSL, src: string): void {
  db.transaction(() => {
    createMetafor(db, meta, src)
    const fieldUuids = createFields(db, meta, src)
    const stateUuids = createSuperposition(db, meta, src, fieldUuids)
    createProcess(db, meta, src, fieldUuids)
    createReactions(db, meta, src, fieldUuids, stateUuids)
    createMatter(db, meta, src, fieldUuids)
  })()
}
