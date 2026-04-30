
import type { SQL } from "bun"

export class Reaction {
  constructor(
    private readonly sql: SQL,
    private readonly metaSrc: string,
    readonly key: string,
  ) {}

    async label(): Promise<string | undefined> {
    const row = (
      await this.sql<Array<{ label: string | null }>>`
        SELECT label FROM reaction WHERE meta = ${this.metaSrc} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`reaction ${this.key} not found in meta ${this.metaSrc}`)
    return row.label ?? undefined
  }

  async setLabel(value: string | null): Promise<void> {
    await this.sql`
      UPDATE reaction SET label = ${value}
      WHERE meta = ${this.metaSrc} AND key = ${this.key}
    `
  }

    async desc(): Promise<string | undefined> {
    const row = (
      await this.sql<Array<{ desc: string | null }>>`
        SELECT desc FROM reaction WHERE meta = ${this.metaSrc} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`reaction ${this.key} not found in meta ${this.metaSrc}`)
    return row.desc ?? undefined
  }

  async setDesc(value: string | null): Promise<void> {
    await this.sql`
      UPDATE reaction SET desc = ${value}
      WHERE meta = ${this.metaSrc} AND key = ${this.key}
    `
  }

    async cond(): Promise<string> {
    const row = (
      await this.sql<Array<{ cond_source: string }>>`
        SELECT cond_source FROM reaction WHERE meta = ${this.metaSrc} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`reaction ${this.key} not found in meta ${this.metaSrc}`)
    return row.cond_source
  }

  async setCond(value: string): Promise<void> {
    await this.sql`
      UPDATE reaction SET cond_source = ${value}
      WHERE meta = ${this.metaSrc} AND key = ${this.key}
    `
  }

    async src(): Promise<string> {
    const row = (
      await this.sql<Array<{ update_source: string }>>`
        SELECT update_source FROM reaction WHERE meta = ${this.metaSrc} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`reaction ${this.key} not found in meta ${this.metaSrc}`)
    return row.update_source
  }

  async setSrc(value: string): Promise<void> {
    await this.sql`
      UPDATE reaction SET update_source = ${value}
      WHERE meta = ${this.metaSrc} AND key = ${this.key}
    `
  }

    async read(): Promise<string[]> {
    const rows = await this.sql<Array<{ key: string }>>`
      SELECT field.key AS key
      FROM reaction_read
      INNER JOIN reaction ON reaction.uuid = reaction_read.reaction
      INNER JOIN field ON field.uuid = reaction_read.field
      WHERE reaction.meta = ${this.metaSrc} AND reaction.key = ${this.key}
      ORDER BY reaction_read.rowid
    `
    return rows.map((row) => row.key)
  }

    async write(): Promise<string[]> {
    const rows = await this.sql<Array<{ key: string }>>`
      SELECT field.key AS key
      FROM reaction_write
      INNER JOIN reaction ON reaction.uuid = reaction_write.reaction
      INNER JOIN field ON field.uuid = reaction_write.field
      WHERE reaction.meta = ${this.metaSrc} AND reaction.key = ${this.key}
      ORDER BY reaction_write.rowid
    `
    return rows.map((row) => row.key)
  }

    async states(): Promise<string[]> {
    const rows = await this.sql<Array<{ name: string }>>`
      SELECT superposition.name AS name
      FROM reaction_superposition
      INNER JOIN reaction ON reaction.uuid = reaction_superposition.reaction
      INNER JOIN superposition ON superposition.uuid = reaction_superposition.superposition
      WHERE reaction.meta = ${this.metaSrc} AND reaction.key = ${this.key}
      ORDER BY reaction_superposition.rowid
    `
    return rows.map((row) => row.name)
  }
}

export class Reactions {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
  ) {}

  async all(): Promise<Reaction[]> {
    const rows = await this.sql<Array<{ key: string }>>`
      SELECT key FROM reaction WHERE meta = ${this.src} ORDER BY rowid
    `
    return rows.map((row) => new Reaction(this.sql, this.src, row.key))
  }

  async get(filter: { key: string }): Promise<Reaction | null> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM reaction WHERE meta = ${this.src} AND key = ${filter.key} LIMIT 1
      `
    )[0]
    return row ? new Reaction(this.sql, this.src, filter.key) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM reaction WHERE meta = ${this.src}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM reaction WHERE meta = ${this.src} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
