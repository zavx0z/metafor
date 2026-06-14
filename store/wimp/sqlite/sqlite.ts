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
import {buildWimpCreateSql} from "./create.ts"
import {Wimp} from "./wimp.ts"
import {emitForceParts, type Particle} from "../../force.ts"
import type {WimpCreateInput} from "./create.t.ts"

export type {WimpCreateInput} from "./create.t.ts"

const collectWimpCreateParticles = (src: string): Particle[] => [{part: "graviton", op: "add", path: "wimp", value: src}]

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
   * Запись идёт одной транзакцией и одним SQL batch; после commit Store отправляет batch `particles`.
   */
  async create(src: string, input: WimpCreateInput = {}): Promise<Wimp> {
    await this.sql.begin(async (tx) => {
      await (tx as SQL).unsafe(buildWimpCreateSql(src, input))
    })

    const wimp = new Wimp(this.sql, src)
    emitForceParts(collectWimpCreateParticles(src))
    return wimp
  }

  async get(src: string): Promise<Wimp | null> {
    return await this.exists(src) ? new Wimp(this.sql, src) : null
  }
}
