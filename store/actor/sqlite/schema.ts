import type { Database } from "bun:sqlite"
import { actorRequiredBackendIndexes } from "../backend.t.ts"
import actorSql from "../sql/actor.sql" with { type: "text" }
import valueSql from "../sql/value.sql" with { type: "text" }
import actorValueSql from "../sql/actor_value.sql" with { type: "text" }
import stateSql from "../sql/state.sql" with { type: "text" }

/**
 * Полная DDL инстансного слоя — конкатенация модулей в порядке FK-зависимостей:
 * - `actor.sql` — корневая таблица actor (FK на meta + self-FK)
 * - `value.sql` — value + value_item (FK на field_enum_variant)
 * - `actor_value.sql` — связь actor↔value (FK на actor + field + value)
 * - `state.sql` — actor_state (FK на actor + superposition)
 *
 * Применяется на ту же `Database`, что и meta-DDL — все FK на meta-таблицы
 * (`meta(src)`, `field(uuid)`, `superposition(uuid)`, `field_enum_variant(uuid)`)
 * становятся жёсткими при включенных `PRAGMA foreign_keys = ON`.
 */
export const actorSchemaSql = [actorSql, valueSql, actorValueSql, stateSql]
  .map((sql) => sql.trim())
  .filter(Boolean)
  .join("\n\n")
  .trim()

/**
 * Имена таблиц в порядке, обратном FK-зависимостям (для безопасного DELETE).
 */
export const actorTableNames = ["actor_state", "actor_value", "value_item", "value", "actor"] as const

/**
 * Применяет actor DDL (5 таблиц + индексы) к уже открытому Database.
 * Идемпотентно — все CREATE с IF NOT EXISTS. PRAGMA не трогает.
 */
export const initializeActorSqliteSchema = (db: Database): void => {
  db.exec(actorSchemaSql)
  for (const index of actorRequiredBackendIndexes) {
    const unique = index.unique ? "UNIQUE " : ""
    db.exec(`CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${index.columns.join(", ")})`)
  }
}

/**
 * Очищает все actor-таблицы. Используется в тестах и на полный сброс.
 */
export const resetActorSqliteSchema = (db: Database): void => {
  db.transaction(() => {
    for (const table of actorTableNames) {
      db.exec(`DELETE FROM ${table}`)
    }
  })()
}
