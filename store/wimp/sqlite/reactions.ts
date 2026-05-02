
import type { MetaDSL } from "../../../metafor.t.ts"
import type { ReactionsSchema } from "../../../reactions.t.ts"
import type { Wimp } from "./wimp.ts"

export class Reaction {
  constructor(
    private readonly reactions: Reactions,
    readonly key: string,
  ) {}

    async label(): Promise<string | undefined> {
    const row = (
      await this.reactions.wimp.sql<Array<{ label: string | null }>>`
        SELECT label FROM reaction WHERE wimp = ${this.reactions.wimp.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`reaction ${this.key} not found in meta ${this.reactions.wimp.src}`)
    return row.label ?? undefined
  }

  async setLabel(value: string | null): Promise<void> {
    await this.reactions.wimp.sql`
      UPDATE reaction SET label = ${value}
      WHERE wimp = ${this.reactions.wimp.src} AND key = ${this.key}
    `
  }

    async desc(): Promise<string | undefined> {
    const row = (
      await this.reactions.wimp.sql<Array<{ desc: string | null }>>`
        SELECT desc FROM reaction WHERE wimp = ${this.reactions.wimp.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`reaction ${this.key} not found in meta ${this.reactions.wimp.src}`)
    return row.desc ?? undefined
  }

  async setDesc(value: string | null): Promise<void> {
    await this.reactions.wimp.sql`
      UPDATE reaction SET desc = ${value}
      WHERE wimp = ${this.reactions.wimp.src} AND key = ${this.key}
    `
  }

    async cond(): Promise<string> {
    const row = (
      await this.reactions.wimp.sql<Array<{ cond_source: string }>>`
        SELECT cond_source FROM reaction WHERE wimp = ${this.reactions.wimp.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`reaction ${this.key} not found in meta ${this.reactions.wimp.src}`)
    return row.cond_source
  }

  async setCond(value: string): Promise<void> {
    await this.reactions.wimp.sql`
      UPDATE reaction SET cond_source = ${value}
      WHERE wimp = ${this.reactions.wimp.src} AND key = ${this.key}
    `
  }

    async src(): Promise<string> {
    const row = (
      await this.reactions.wimp.sql<Array<{ update_source: string }>>`
        SELECT update_source FROM reaction WHERE wimp = ${this.reactions.wimp.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`reaction ${this.key} not found in meta ${this.reactions.wimp.src}`)
    return row.update_source
  }

  async setSrc(value: string): Promise<void> {
    await this.reactions.wimp.sql`
      UPDATE reaction SET update_source = ${value}
      WHERE wimp = ${this.reactions.wimp.src} AND key = ${this.key}
    `
  }

    async read(): Promise<string[]> {
    const rows = await this.reactions.wimp.sql<Array<{ key: string }>>`
      SELECT field.key AS key
      FROM reaction_read
      INNER JOIN reaction ON reaction.uuid = reaction_read.reaction
      INNER JOIN field ON field.uuid = reaction_read.field
      WHERE reaction.wimp = ${this.reactions.wimp.src} AND reaction.key = ${this.key}
      ORDER BY reaction_read.rowid
    `
    return rows.map((row) => row.key)
  }

    async write(): Promise<string[]> {
    const rows = await this.reactions.wimp.sql<Array<{ key: string }>>`
      SELECT field.key AS key
      FROM reaction_write
      INNER JOIN reaction ON reaction.uuid = reaction_write.reaction
      INNER JOIN field ON field.uuid = reaction_write.field
      WHERE reaction.wimp = ${this.reactions.wimp.src} AND reaction.key = ${this.key}
      ORDER BY reaction_write.rowid
    `
    return rows.map((row) => row.key)
  }

    async states(): Promise<string[]> {
    const rows = await this.reactions.wimp.sql<Array<{ name: string }>>`
      SELECT superposition.name AS name
      FROM reaction_superposition
      INNER JOIN reaction ON reaction.uuid = reaction_superposition.reaction
      INNER JOIN superposition ON superposition.uuid = reaction_superposition.superposition
      WHERE reaction.wimp = ${this.reactions.wimp.src} AND reaction.key = ${this.key}
      ORDER BY reaction_superposition.rowid
    `
    return rows.map((row) => row.name)
  }
}

export class Reactions {
  constructor(readonly wimp: Wimp) {}

  async create(dsl: MetaDSL): Promise<void> {
    if (!dsl.reactions) return

    const sql = this.wimp.sql
    const src = this.wimp.src
    const rs = dsl.reactions as ReactionsSchema

    for (const [id, r] of Object.entries(rs.reactions)) {
      const uuid = crypto.randomUUID()
      await sql`
        INSERT INTO reaction (uuid, wimp, key, label, desc, cond_source, update_source)
        VALUES (${uuid}, ${src}, ${id}, ${r.label}, ${r.desc || null}, ${r.cond}, ${r.src})
      `

      if (r.read) {
        for (const fieldKey of r.read) {
          await sql`
            INSERT INTO reaction_read (reaction, field)
            SELECT ${uuid}, field.uuid
            FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
          `
        }
      }
      if (r.write) {
        for (const fieldKey of r.write) {
          await sql`
            INSERT INTO reaction_write (reaction, field)
            SELECT ${uuid}, field.uuid
            FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
          `
        }
      }

      // Reaction Superpositions
      for (const [state, reactionIds] of Object.entries(rs.superposition)) {
        if (reactionIds.includes(id)) {
          await sql`
            INSERT INTO reaction_superposition (reaction, superposition)
            SELECT ${uuid}, superposition.uuid
            FROM superposition
            WHERE superposition.wimp = ${src} AND superposition.name = ${state}
          `
        }
      }
    }
  }

  async all(): Promise<Reaction[]> {
    const rows = await this.wimp.sql<Array<{ key: string }>>`
      SELECT key FROM reaction WHERE wimp = ${this.wimp.src} ORDER BY rowid
    `
    return rows.map((row) => new Reaction(this, row.key))
  }

  async get(filter: { key: string }): Promise<Reaction | null> {
    const row = (
      await this.wimp.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM reaction WHERE wimp = ${this.wimp.src} AND key = ${filter.key} LIMIT 1
      `
    )[0]
    return row ? new Reaction(this, filter.key) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.wimp.sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM reaction WHERE wimp = ${this.wimp.src}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.wimp.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM reaction WHERE wimp = ${this.wimp.src} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
