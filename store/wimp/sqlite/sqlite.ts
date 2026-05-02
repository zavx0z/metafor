import wimpSchemaSql from "./wimp.sql" with {type: "text"}
import fieldsSchemaSql from "./fields.sql" with {type: "text"}
import superpositionSchemaSql from "./superposition.sql" with {type: "text"}
import processSchemaSql from "./process.sql" with {type: "text"}
import actionSchemaSql from "./action.sql" with {type: "text"}
import finallySchemaSql from "./finally.sql" with {type: "text"}
import reactionsSchemaSql from "./reactions.sql" with {type: "text"}
import matterSchemaSql from "./matter.sql" with {type: "text"}
import {SQL} from "bun"
import type {MetaDSL} from "../../../metafor.t"
import type {MatterRelationParticle} from "./matter.t.ts"
import {createFields} from "./fields.C.ts"
import {createMatter} from "./matter.C.ts"
import {createWimp} from "./wimp.C.ts"
import {createProcess} from "./process.C.ts"
import {createReactions} from "./reactions.C.ts"
import {createSuperposition} from "./superposition.C.ts"
import {Wimp} from "./wimp.ts"
import type {DarkWimpParticleModel} from "./read.t.ts"
import {DarkParticleModelProjection} from "./read.ts"

export class StoreWimpSqlite {
  private constructor(private readonly sql: SQL) {}

  static async open(sql: SQL): Promise<StoreWimpSqlite> {
    await sql.unsafe(
      [
        wimpSchemaSql,
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
   * Записывает декларацию меты в БД одной транзакцией. Идемпотентно: повторная запись с тем же `src`
   * сначала удаляет старую декларацию (cascade на field/superposition/process/reaction/matter).
   */
  async create(src: string, dsl: MetaDSL, matter: MatterRelationParticle[]): Promise<Wimp> {
    await this.sql`DELETE FROM wimp WHERE src = ${src}`
    await this.sql.begin(async (tx) => {
      await createWimp(tx, dsl, src)
      const fieldUuids = await createFields(tx, dsl, src)
      const stateUuids = await createSuperposition(tx, dsl, src, fieldUuids)
      await createProcess(tx, dsl, src, fieldUuids)
      await createReactions(tx, dsl, src, fieldUuids, stateUuids)
      await createMatter(tx, src, matter)
    })
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

  async readDarkParticleModel(src: string): Promise<DarkWimpParticleModel | null> {
    return new DarkParticleModelProjection(this.sql).read(src)
  }
}
