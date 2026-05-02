import type { Reactions } from "./reactions.ts"

/**
 * Sub-ORM для таблицы `reaction_read` (PK (reaction, field)).
 * Резолв `field.uuid` через WHERE field.wimp=src AND field.key=fieldKey.
 */
export class ReactionRead {
  constructor(readonly reaction: Reaction) {}

  async add(fieldKey: string): Promise<void> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionUuid = await this.reaction.uuid()
    await sql`
      INSERT OR IGNORE INTO reaction_read (reaction, field)
      SELECT ${reactionUuid}, field.uuid
      FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
    `
  }

  async remove(fieldKey: string): Promise<void> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionUuid = await this.reaction.uuid()
    await sql`
      DELETE FROM reaction_read
      WHERE reaction = ${reactionUuid}
        AND field IN (SELECT uuid FROM field WHERE wimp = ${src} AND key = ${fieldKey})
    `
  }

  async all(): Promise<string[]> {
    const sql = this.reaction.reactions.wimp.sql
    const reactionUuid = await this.reaction.uuid()
    const rows = await sql<Array<{ key: string }>>`
      SELECT field.key AS key
      FROM reaction_read rr
      INNER JOIN field ON field.uuid = rr.field
      WHERE rr.reaction = ${reactionUuid}
      ORDER BY rr.rowid
    `
    return rows.map((row) => row.key)
  }

  async has(fieldKey: string): Promise<boolean> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionUuid = await this.reaction.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM reaction_read rr
        INNER JOIN field ON field.uuid = rr.field
        WHERE rr.reaction = ${reactionUuid}
          AND field.wimp = ${src}
          AND field.key = ${fieldKey}
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  async count(): Promise<number> {
    const sql = this.reaction.reactions.wimp.sql
    const reactionUuid = await this.reaction.uuid()
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM reaction_read WHERE reaction = ${reactionUuid}
      `
    )[0]
    return row?.count ?? 0
  }
}

/**
 * Sub-ORM для таблицы `reaction_write` (PK (reaction, field)).
 * Резолв `field.uuid` через WHERE field.wimp=src AND field.key=fieldKey.
 */
export class ReactionWrite {
  constructor(readonly reaction: Reaction) {}

  async add(fieldKey: string): Promise<void> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionUuid = await this.reaction.uuid()
    await sql`
      INSERT OR IGNORE INTO reaction_write (reaction, field)
      SELECT ${reactionUuid}, field.uuid
      FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
    `
  }

  async remove(fieldKey: string): Promise<void> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionUuid = await this.reaction.uuid()
    await sql`
      DELETE FROM reaction_write
      WHERE reaction = ${reactionUuid}
        AND field IN (SELECT uuid FROM field WHERE wimp = ${src} AND key = ${fieldKey})
    `
  }

  async all(): Promise<string[]> {
    const sql = this.reaction.reactions.wimp.sql
    const reactionUuid = await this.reaction.uuid()
    const rows = await sql<Array<{ key: string }>>`
      SELECT field.key AS key
      FROM reaction_write rw
      INNER JOIN field ON field.uuid = rw.field
      WHERE rw.reaction = ${reactionUuid}
      ORDER BY rw.rowid
    `
    return rows.map((row) => row.key)
  }

  async has(fieldKey: string): Promise<boolean> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionUuid = await this.reaction.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM reaction_write rw
        INNER JOIN field ON field.uuid = rw.field
        WHERE rw.reaction = ${reactionUuid}
          AND field.wimp = ${src}
          AND field.key = ${fieldKey}
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  async count(): Promise<number> {
    const sql = this.reaction.reactions.wimp.sql
    const reactionUuid = await this.reaction.uuid()
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM reaction_write WHERE reaction = ${reactionUuid}
      `
    )[0]
    return row?.count ?? 0
  }
}

/**
 * Sub-ORM для таблицы `reaction_superposition` (PK (reaction, superposition)).
 * Связь реакции со state-ами, в которых она активна.
 * Резолв `superposition.uuid` через WHERE superposition.wimp=src AND superposition.name=stateName.
 */
export class ReactionStates {
  constructor(readonly reaction: Reaction) {}

  async add(stateName: string): Promise<void> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionUuid = await this.reaction.uuid()
    await sql`
      INSERT OR IGNORE INTO reaction_superposition (reaction, superposition)
      SELECT ${reactionUuid}, superposition.uuid
      FROM superposition WHERE superposition.wimp = ${src} AND superposition.name = ${stateName}
    `
  }

  async remove(stateName: string): Promise<void> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionUuid = await this.reaction.uuid()
    await sql`
      DELETE FROM reaction_superposition
      WHERE reaction = ${reactionUuid}
        AND superposition IN (SELECT uuid FROM superposition WHERE wimp = ${src} AND name = ${stateName})
    `
  }

  async all(): Promise<string[]> {
    const sql = this.reaction.reactions.wimp.sql
    const reactionUuid = await this.reaction.uuid()
    const rows = await sql<Array<{ name: string }>>`
      SELECT superposition.name AS name
      FROM reaction_superposition rs
      INNER JOIN superposition ON superposition.uuid = rs.superposition
      WHERE rs.reaction = ${reactionUuid}
      ORDER BY rs.rowid
    `
    return rows.map((row) => row.name)
  }

  async has(stateName: string): Promise<boolean> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionUuid = await this.reaction.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM reaction_superposition rs
        INNER JOIN superposition ON superposition.uuid = rs.superposition
        WHERE rs.reaction = ${reactionUuid}
          AND superposition.wimp = ${src}
          AND superposition.name = ${stateName}
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  async count(): Promise<number> {
    const sql = this.reaction.reactions.wimp.sql
    const reactionUuid = await this.reaction.uuid()
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM reaction_superposition WHERE reaction = ${reactionUuid}
      `
    )[0]
    return row?.count ?? 0
  }
}

/**
 * ORM для строки таблицы `reaction` (UNIQUE wimp+key).
 * Sub-ORMs `read`/`write`/`states` управляют связями reaction_read/reaction_write/reaction_superposition.
 */
export class Reaction {
  readonly read: ReactionRead
  readonly write: ReactionWrite
  readonly states: ReactionStates

  constructor(
    readonly reactions: Reactions,
    readonly key: string,
  ) {
    this.read = new ReactionRead(this)
    this.write = new ReactionWrite(this)
    this.states = new ReactionStates(this)
  }

  /**
   * Резолвит uuid строки `reaction` по (wimp, key). Throw если не найдено.
   */
  async uuid(): Promise<string> {
    const row = (
      await this.reactions.wimp.sql<Array<{ uuid: string }>>`
        SELECT uuid FROM reaction
        WHERE wimp = ${this.reactions.wimp.src} AND key = ${this.key}
        LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`reaction ${this.key} not found in wimp ${this.reactions.wimp.src}`)
    return row.uuid
  }

  async label(): Promise<string | undefined> {
    const row = (
      await this.reactions.wimp.sql<Array<{ label: string | null }>>`
        SELECT label FROM reaction WHERE wimp = ${this.reactions.wimp.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`reaction ${this.key} not found in wimp ${this.reactions.wimp.src}`)
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
    if (!row) throw new Error(`reaction ${this.key} not found in wimp ${this.reactions.wimp.src}`)
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
    if (!row) throw new Error(`reaction ${this.key} not found in wimp ${this.reactions.wimp.src}`)
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
    if (!row) throw new Error(`reaction ${this.key} not found in wimp ${this.reactions.wimp.src}`)
    return row.update_source
  }

  async setSrc(value: string): Promise<void> {
    await this.reactions.wimp.sql`
      UPDATE reaction SET update_source = ${value}
      WHERE wimp = ${this.reactions.wimp.src} AND key = ${this.key}
    `
  }
}
