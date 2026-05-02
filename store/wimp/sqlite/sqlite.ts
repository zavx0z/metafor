import wimpSchemaSql from "./wimp.sql" with {type: "text"}
import massSchemaSql from "./mass.sql" with {type: "text"}
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
import {Wimp} from "./wimp.ts"

export class StoreWimpSqlite {
  private constructor(private readonly sql: SQL) {}

  static async open(sql: SQL): Promise<StoreWimpSqlite> {
    await sql.unsafe(
      [
        wimpSchemaSql,
        massSchemaSql,
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
    return new StoreWimpSqlite(sql)
  }

  /**
   * Создаёт минимальную row в `wimp` (только `src`, остальные поля null).
   * Идемпотентно по src через DELETE+INSERT (cascade на field/state/process/reaction/matter/wimp_mass_value).
   * Наполнение делается тонкими domain-методами на ORM (`wimp.fields.string`/`enum`/..., etc.).
   */
  async create(src: string): Promise<Wimp> {
    await this.sql`DELETE FROM wimp WHERE src = ${src}`
    await this.sql`INSERT INTO wimp (src) VALUES (${src})`
    return new Wimp(this.sql, src)
  }

  async get(src: string): Promise<Wimp | null> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM wimp WHERE src = ${src} LIMIT 1
      `
    )[0]
    return row ? new Wimp(this.sql, src) : null
  }
}
