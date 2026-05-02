import wimpSchemaSql from "./wimp.sql" with {type: "text"}
import massSchemaSql from "./mass.sql" with {type: "text"}
import fieldsSchemaSql from "./fields.sql" with {type: "text"}
import superpositionSchemaSql from "./superposition.sql" with {type: "text"}
import processSchemaSql from "./process.sql" with {type: "text"}
import actionSchemaSql from "./action.sql" with {type: "text"}
import finallySchemaSql from "./finally.sql" with {type: "text"}
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
        fieldsSchemaSql,
        superpositionSchemaSql,
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
   * Идемпотентно по src через DELETE+INSERT (cascade на field/superposition/process/reaction/matter/wimp_mass_value).
   * Наполнение делается тонкими domain-методами на ORM (`wimp.fields.create`, etc.).
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
