import wimpSchemaSql from "./wimp.sql" with {type: "text"}
import fieldSchemaSql from "./fields/field.sql" with {type: "text"}
import fieldStringSchemaSql from "./fields/string.sql" with {type: "text"}
import fieldNumberSchemaSql from "./fields/number.sql" with {type: "text"}
import fieldBooleanSchemaSql from "./fields/boolean.sql" with {type: "text"}
import fieldArraySchemaSql from "./fields/array.sql" with {type: "text"}
import fieldEnumSchemaSql from "./fields/enum.sql" with {type: "text"}
import stateSchemaSql from "./states/state.sql" with {type: "text"}
import transitionSchemaSql from "./states/transition.sql" with {type: "text"}
import conditionSchemaSql from "./states/condition.sql" with {type: "text"}
import predicateSchemaSql from "./states/predicate.sql" with {type: "text"}
import processSchemaSql from "./processes/process.sql" with {type: "text"}
import actionSchemaSql from "./processes/action.sql" with {type: "text"}
import finallySchemaSql from "./processes/finally.sql" with {type: "text"}
import reactionsSchemaSql from "./reactions.sql" with {type: "text"}
import matterSchemaSql from "./matter.sql" with {type: "text"}
import {SQL} from "bun"
import {writeWimpCreate} from "./create.ts"
import {Wimp} from "./wimp.ts"
import type { WimpCreateInput } from "@metafor/types/boundary/wimp"

/**
 * Rebuilds the two predicate tables created by versions that predated JSON
 * operands and the complete public condition language.
 *
 * SQLite cannot widen a CHECK constraint with `ALTER COLUMN`, therefore the
 * migration copies the old rows into the current schema in one transaction.
 * Existing scalar and list predicates keep their identifiers and ordering.
 */
async function migrateConditionPredicates(sql: SQL): Promise<void> {
  const columns = await sql.unsafe<Array<{name: string}>>(
    "PRAGMA table_info(condition_predicate)",
  )
  const legacyTables = await sql.unsafe<Array<{name: string}>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('condition_predicate_legacy', 'condition_list_item_legacy')",
  )
  const legacyTableNames = new Set(legacyTables.map(({name}) => name))
  const hasLegacyPredicate = legacyTableNames.has("condition_predicate_legacy")
  const hasLegacyList = legacyTableNames.has("condition_list_item_legacy")
  if (hasLegacyPredicate !== hasLegacyList) {
    throw new Error("Boundary predicate migration is incomplete: both legacy tables are required")
  }
  const hasCurrentSchema = columns.some((column) => column.name === "value_json")
  if (columns.length === 0 || (hasCurrentSchema && !hasLegacyPredicate)) {
    return
  }

  await sql.begin(async (tx) => {
    if (!hasCurrentSchema) {
      await tx.unsafe("DROP INDEX IF EXISTS condition_list_item_by_predicate")
      await tx.unsafe("DROP INDEX IF EXISTS condition_predicate_by_condition")
      await tx.unsafe("ALTER TABLE condition_list_item RENAME TO condition_list_item_legacy")
      await tx.unsafe("ALTER TABLE condition_predicate RENAME TO condition_predicate_legacy")
      await tx.unsafe(predicateSchemaSql)
    }

    await tx.unsafe(`
      INSERT OR IGNORE INTO condition_predicate (
        id, condition, predicate_order, subject_kind, operator, value_kind,
        value_boolean, value_number, value_text, value_variant, value_json
      )
      SELECT
        id, condition, predicate_order, subject_kind, operator, value_kind,
        value_boolean, value_number, value_text, value_variant, NULL
      FROM condition_predicate_legacy
    `)
    await tx.unsafe(`
      INSERT OR IGNORE INTO condition_list_item (
        predicate, item_order, value_kind, value_boolean,
        value_number, value_text, value_variant
      )
      SELECT
        predicate, item_order, value_kind, value_boolean,
        value_number, value_text, value_variant
      FROM condition_list_item_legacy
    `)
    await tx.unsafe("DROP TABLE condition_list_item_legacy")
    await tx.unsafe("DROP TABLE condition_predicate_legacy")
  })
}

export class BoundaryWimpSqlite {
  private constructor(private readonly sql: SQL) {}

  static async open(sql: SQL): Promise<BoundaryWimpSqlite> {
    await sql.unsafe(
      [
        wimpSchemaSql,
        fieldSchemaSql,
        fieldStringSchemaSql,
        fieldNumberSchemaSql,
        fieldBooleanSchemaSql,
        fieldArraySchemaSql,
        fieldEnumSchemaSql,
        stateSchemaSql,
        transitionSchemaSql,
        conditionSchemaSql,
        predicateSchemaSql,
        processSchemaSql,
        actionSchemaSql,
        finallySchemaSql,
        reactionsSchemaSql,
        matterSchemaSql,
      ]
        .map((sql) => sql.trim())
        .filter(Boolean)
        .join("\n\n")
        .trim(),
    )
    await migrateConditionPredicates(sql)
    const matterWimpColumns = await sql.unsafe<Array<{name: string}>>(
      "PRAGMA table_info(matter_particle_wimp)",
    )
    if (!matterWimpColumns.some((column) => column.name === "energy_binding")) {
      await sql.unsafe(
        "ALTER TABLE matter_particle_wimp ADD COLUMN energy_binding INTEGER REFERENCES matter_binding(id) ON DELETE CASCADE",
      )
    }
    return new BoundaryWimpSqlite(sql)
  }

  /**
   * Дешевая проверка существования декларации без создания ORM-объекта.
   */
  async exists(src: string): Promise<boolean> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM wimp WHERE src = ${src} LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  /**
   * Создаёт wimp-декларацию одним prepared input.
   * Запись идёт одной транзакцией; auto-increment id дочерних строк читаются через `RETURNING`.
   */
  async create(src: string, input: WimpCreateInput = {}): Promise<Wimp> {
    await this.sql.begin(async (tx) => {
      await writeWimpCreate(tx, src, input)
    })

    const wimp = new Wimp(this.sql, src)
    return wimp
  }

  async get(src: string): Promise<Wimp | null> {
    return await this.exists(src) ? new Wimp(this.sql, src) : null
  }
}
