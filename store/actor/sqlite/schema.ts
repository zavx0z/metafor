import actorSql from "./actor.sql" with { type: "text" }
import valueSql from "./value.sql" with { type: "text" }
import actorValueSql from "./actor_value.sql" with { type: "text" }
import stateSql from "./state.sql" with { type: "text" }

/**
 * Имена таблиц actor-слоя. Префикс `actor_` — для actor-сущностей,
 * `value*` — глобальные value-записи (могут разделяться).
 *
 * Корневая `value` хранит только дискриминатор `kind`; скалярное содержимое —
 * в типизированных подтаблицах `value_<kind>`. Элементы list-значения —
 * в плоской `value_list_item` (по аналогии с `field_array_default_item` в meta).
 */
export type ActorTableName =
  | "actor"
  | "actor_value"
  | "actor_state"
  | "value"
  | "value_boolean"
  | "value_number"
  | "value_string"
  | "value_enum"
  | "value_list_item"

interface ActorIndexSpec {
  name: string
  table: ActorTableName
  columns: readonly string[]
  unique: boolean
}

const actorIndexes: readonly ActorIndexSpec[] = [
  { name: "actor_by_meta", table: "actor", columns: ["meta"], unique: false },
  { name: "actor_by_parent", table: "actor", columns: ["parent"], unique: false },
  { name: "actor_by_parent_and_position", table: "actor", columns: ["parent", "position"], unique: false },
  { name: "actor_value_by_value", table: "actor_value", columns: ["value"], unique: false },
  { name: "actor_value_by_field", table: "actor_value", columns: ["field"], unique: false },
] as const

const indexDdl = (idx: ActorIndexSpec): string => {
  const unique = idx.unique ? "UNIQUE " : ""
  return `CREATE ${unique}INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.columns.join(", ")});`
}

/**
 * Полный DDL actor-слоя — DDL таблиц + DDL индексов одной строкой.
 * Применяется к открытой Database через `db.run(actorSchemaSql)`.
 *
 * Применяется на ту же Database, что и meta-DDL — все FK на meta-таблицы
 * (`meta(src)`, `field(uuid)`, `superposition(uuid)`, `field_enum_variant(uuid)`)
 * становятся жёсткими при `PRAGMA foreign_keys = ON`.
 */
export const actorSchemaSql: string = [
  [actorSql, valueSql, actorValueSql, stateSql].map((sql) => sql.trim()).filter(Boolean).join("\n\n"),
  actorIndexes.map(indexDdl).join("\n"),
]
  .join("\n\n")
  .trim()

/**
 * Имена таблиц в порядке, обратном FK-зависимостям (для безопасного DELETE).
 * Каскад FK снимет всё с одного `DELETE FROM actor`, но явный список держит
 * инвариант видимым.
 */
export const actorTableNames: readonly ActorTableName[] = [
  "actor_state",
  "actor_value",
  "value_list_item",
  "value_enum",
  "value_string",
  "value_number",
  "value_boolean",
  "value",
  "actor",
] as const
