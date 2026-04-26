import type { Database } from "bun:sqlite"
import { actorRequiredBackendIndexes } from "../backend.t.ts"
import actorSql from "../sql/actor.sql" with { type: "text" }
import fieldsSql from "../sql/fields.sql" with { type: "text" }
import stateSql from "../sql/state.sql" with { type: "text" }
import entanglementSql from "../sql/entanglement.sql" with { type: "text" }

/**
 * Полная DDL инстансного слоя — конкатенация модулей `actor.sql` + `fields.sql` +
 * `state.sql` + `entanglement.sql`. Порядок важен: дочерние таблицы ссылаются
 * через FK на ранее объявленные.
 *
 * Применяется на ту же `Database`, что и meta-DDL и любые другие схемы;
 * префикс `actor_` обеспечивает изоляцию пространства имён.
 *
 * FK на `meta(src)` (через `meta_src`, `world`) намеренно НЕ создаются: actor
 * может ссылаться на мету, лежащую в другой БД, либо ещё не загруженную.
 * Целостность ref проверяется на стороне рантайма перед записью.
 */
export const actorDslSchemaSql = [actorSql, fieldsSql, stateSql, entanglementSql]
  .map((sql) => sql.trim())
  .filter(Boolean)
  .join("\n\n")
  .trim()

/**
 * Имена всех 11 actor-таблиц в порядке, обратном FK-зависимостям.
 * Используется для атомарного reset (DELETE сверху вниз — каскад FK снимает зависимое автоматически,
 * но явное перечисление держит инвариант видимым).
 */
export const actorTableNames = [
  "actor_entanglement_field_member",
  "actor_entanglement_field",
  "actor_entanglement_member",
  "actor_entanglement",
  "actor_state",
  "actor_source",
  "actor_value_item",
  "actor_value",
  "actor_field",
  "actor_edge",
  "actor",
] as const

/**
 * Применяет actor DDL (11 таблиц + индексы) к уже открытому Database.
 * Идемпотентно — все CREATE с IF NOT EXISTS. PRAGMA не трогает (ответственность владельца Database).
 */
export const initializeActorSqliteSchema = (db: Database): void => {
  db.exec(actorDslSchemaSql)
  for (const index of actorRequiredBackendIndexes) {
    const unique = index.unique ? "UNIQUE " : ""
    db.exec(`CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${index.columns.join(", ")})`)
  }
}

/**
 * Очищает все actor-таблицы для всех миров. Используется в тестах и на полный сброс state-а.
 */
export const resetActorSqliteSchema = (db: Database): void => {
  db.transaction(() => {
    for (const table of actorTableNames) {
      db.exec(`DELETE FROM ${table}`)
    }
  })()
}
