import metaforSchemaSql from "./meta.sql" with {type: "text"}
import fieldsSchemaSql from "./fields.sql" with {type: "text"}
import superpositionSchemaSql from "./superposition.sql" with {type: "text"}
import processSchemaSql from "./process.sql" with {type: "text"}
import actionSchemaSql from "./action.sql" with {type: "text"}
import finallySchemaSql from "./finally.sql" with {type: "text"}
import reactionsSchemaSql from "./reactions.sql" with {type: "text"}
import matterSchemaSql from "./matter.sql" with {type: "text"}
import { SQL } from "bun"
import type { MetaDSL } from "../../../metafor.t"
import { createFields } from "./fields.C.ts"
import { createMatter } from "./matter.C.ts"
import { createMeta } from "./meta.C.ts"
import { createProcess } from "./process.C.ts"
import { createReactions } from "./reactions.C.ts"
import { createSuperposition } from "./superposition.C.ts"
import { Meta } from "./meta.ts"
import type { DarkMetaParticleModel } from "./read.t.ts"
import { DarkParticleModelProjection } from "./read.ts"

export class StoreMetaSqlite {
  private constructor(private readonly sql: SQL) {}

  static async open(sql: SQL): Promise<StoreMetaSqlite> {
    await sql.unsafe(
      [
        metaforSchemaSql,
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
    return new StoreMetaSqlite(sql)
  }

  async create(src: string, dsl: MetaDSL): Promise<Meta> {
    await this.sql`DELETE FROM meta WHERE src = ${src}`
    await this.sql.begin(async (tx) => {
      await createMeta(tx, dsl, src)
      const fieldUuids = await createFields(tx, dsl, src)
      const stateUuids = await createSuperposition(tx, dsl, src, fieldUuids)
      await createProcess(tx, dsl, src, fieldUuids)
      await createReactions(tx, dsl, src, fieldUuids, stateUuids)
      await createMatter(tx, dsl, src, fieldUuids)
    })
    return new Meta(this.sql, src)
  }

  async get(src: string): Promise<Meta | null> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM meta WHERE src = ${src} LIMIT 1
      `
    )[0]
    return row ? new Meta(this.sql, src) : null
  }

  async delete(src: string): Promise<void> {
    await this.sql`DELETE FROM meta WHERE src = ${src}`
  }

  async readDarkParticleModel(src: string): Promise<DarkMetaParticleModel | null> {
    return new DarkParticleModelProjection(this.sql).read(src)
  }
}
