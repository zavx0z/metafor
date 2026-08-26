import type { Reactions } from "./reactions.ts"
import type {ReactionSourceRelation, ReactionSourceSelector} from "@metafor/types/metafor/reactions"
import {parseMetaAddress} from "@metafor/types/metafor/graph"

const normalizeSources = (
  sources: readonly ReactionSourceSelector[],
): ReactionSourceSelector[] => {
  if (sources.length === 0) throw new Error("Reaction must declare at least one source selector")
  return sources.map((source, index) => {
    const atom = source.atom?.trim()
    const meta = source.meta?.trim()
    const relation = source.relation
    if (!atom && !meta && relation === undefined) {
      throw new Error(`Reaction source ${index} must declare atom, meta or relation`)
    }
    if (atom !== undefined && !/^atom:[1-9]\d*$/.test(atom)) {
      throw new Error(`Reaction source ${index} atom must use atom:<positive-id>`)
    }
    if (meta !== undefined && parseMetaAddress(meta) === null) {
      throw new Error(`Reaction source ${index} meta must use <owner>/<repository>`)
    }
    if (relation !== undefined && relation !== "parent" && relation !== "child" && relation !== "descendant") {
      throw new Error(`Reaction source ${index} relation is unsupported`)
    }
    const states = [...new Set(source.states.map((state) => state.trim()).filter(Boolean))]
    if (states.length === 0) throw new Error(`Reaction source ${index} must declare at least one State`)
    return {
      ...(atom ? {atom: atom as `atom:${string}`} : {}),
      ...(meta ? {meta} : {}),
      ...(relation === undefined ? {} : {relation}),
      states: states as [string, ...string[]],
    }
  })
}

/**
 * Sub-ORM для таблицы `reaction_read` (PK (reaction, field)).
 * Резолв `field.id` через WHERE field.wimp=src AND field.key=fieldKey.
 */
export class ReactionRead {
  constructor(readonly reaction: Reaction) {}

  async add(fieldKey: string): Promise<void> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionId = await this.reaction.id()
    const field = (await sql<Array<{id: number}>>`
      SELECT id FROM field WHERE wimp = ${src} AND key = ${fieldKey}
    `)[0]
    if (!field) throw new Error(`Reaction ${this.reaction.key} references unavailable Field ${fieldKey}`)
    await sql`INSERT OR IGNORE INTO reaction_read (reaction, field) VALUES (${reactionId}, ${field.id})`
  }

  async remove(fieldKey: string): Promise<void> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionId = await this.reaction.id()
    await sql`
      DELETE FROM reaction_read
      WHERE reaction = ${reactionId}
        AND field IN (SELECT id FROM field WHERE wimp = ${src} AND key = ${fieldKey})
    `
  }

  async all(): Promise<string[]> {
    const sql = this.reaction.reactions.wimp.sql
    const reactionId = await this.reaction.id()
    const rows = await sql<Array<{ key: string }>>`
      SELECT field.key AS key
      FROM reaction_read rr
      INNER JOIN field ON field.id = rr.field
      WHERE rr.reaction = ${reactionId}
      ORDER BY rr.rowid
    `
    return rows.map((row) => row.key)
  }

  async has(fieldKey: string): Promise<boolean> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionId = await this.reaction.id()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM reaction_read rr
        INNER JOIN field ON field.id = rr.field
        WHERE rr.reaction = ${reactionId}
          AND field.wimp = ${src}
          AND field.key = ${fieldKey}
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  async count(): Promise<number> {
    const sql = this.reaction.reactions.wimp.sql
    const reactionId = await this.reaction.id()
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM reaction_read WHERE reaction = ${reactionId}
      `
    )[0]
    return row?.count ?? 0
  }
}

/**
 * Sub-ORM для таблицы `reaction_write` (PK (reaction, field)).
 * Резолв `field.id` через WHERE field.wimp=src AND field.key=fieldKey.
 */
export class ReactionWrite {
  constructor(readonly reaction: Reaction) {}

  async add(fieldKey: string): Promise<void> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionId = await this.reaction.id()
    const field = (await sql<Array<{id: number; type: string}>>`
      SELECT id, type FROM field WHERE wimp = ${src} AND key = ${fieldKey}
    `)[0]
    if (!field) throw new Error(`Reaction ${this.reaction.key} references unavailable Field ${fieldKey}`)
    if (field.type === "enum" || field.type === "array") {
      throw new Error(`Reaction ${this.reaction.key} cannot write topology Field ${fieldKey}`)
    }
    await sql`INSERT OR IGNORE INTO reaction_write (reaction, field) VALUES (${reactionId}, ${field.id})`
  }

  async remove(fieldKey: string): Promise<void> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionId = await this.reaction.id()
    await sql`
      DELETE FROM reaction_write
      WHERE reaction = ${reactionId}
        AND field IN (SELECT id FROM field WHERE wimp = ${src} AND key = ${fieldKey})
    `
  }

  async all(): Promise<string[]> {
    const sql = this.reaction.reactions.wimp.sql
    const reactionId = await this.reaction.id()
    const rows = await sql<Array<{ key: string }>>`
      SELECT field.key AS key
      FROM reaction_write rw
      INNER JOIN field ON field.id = rw.field
      WHERE rw.reaction = ${reactionId}
      ORDER BY rw.rowid
    `
    return rows.map((row) => row.key)
  }

  async has(fieldKey: string): Promise<boolean> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionId = await this.reaction.id()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM reaction_write rw
        INNER JOIN field ON field.id = rw.field
        WHERE rw.reaction = ${reactionId}
          AND field.wimp = ${src}
          AND field.key = ${fieldKey}
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  async count(): Promise<number> {
    const sql = this.reaction.reactions.wimp.sql
    const reactionId = await this.reaction.id()
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM reaction_write WHERE reaction = ${reactionId}
      `
    )[0]
    return row?.count ?? 0
  }
}

/**
 * Sub-ORM для таблицы `reaction_state` (PK (reaction, state)).
 * Связь реакции со state-ами, в которых она активна.
 * Резолв `state.id` через WHERE state.wimp=src AND state.name=stateName.
 */
export class ReactionStates {
  constructor(readonly reaction: Reaction) {}

  async add(stateName: string): Promise<void> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionId = await this.reaction.id()
    const state = (await sql<Array<{id: number}>>`
      SELECT id FROM state WHERE wimp = ${src} AND name = ${stateName}
    `)[0]
    if (!state) throw new Error(`Reaction ${this.reaction.key} references unavailable target State ${stateName}`)
    await sql`INSERT OR IGNORE INTO reaction_state (reaction, state) VALUES (${reactionId}, ${state.id})`
  }

  async remove(stateName: string): Promise<void> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionId = await this.reaction.id()
    await sql`
      DELETE FROM reaction_state
      WHERE reaction = ${reactionId}
        AND state IN (SELECT id FROM state WHERE wimp = ${src} AND name = ${stateName})
    `
  }

  async all(): Promise<string[]> {
    const sql = this.reaction.reactions.wimp.sql
    const reactionId = await this.reaction.id()
    const rows = await sql<Array<{ name: string }>>`
      SELECT state.name AS name
      FROM reaction_state rs
      INNER JOIN state ON state.id = rs.state
      WHERE rs.reaction = ${reactionId}
      ORDER BY rs.rowid
    `
    return rows.map((row) => row.name)
  }

  async has(stateName: string): Promise<boolean> {
    const sql = this.reaction.reactions.wimp.sql
    const src = this.reaction.reactions.wimp.src
    const reactionId = await this.reaction.id()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM reaction_state rs
        INNER JOIN state ON state.id = rs.state
        WHERE rs.reaction = ${reactionId}
          AND state.wimp = ${src}
          AND state.name = ${stateName}
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  async count(): Promise<number> {
    const sql = this.reaction.reactions.wimp.sql
    const reactionId = await this.reaction.id()
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM reaction_state WHERE reaction = ${reactionId}
      `
    )[0]
    return row?.count ?? 0
  }
}

type ReactionMassTable = "reaction_mass_read" | "reaction_mass_write"

/** WIMP-local declared Mass keys for one Reaction access direction. */
export class ReactionMassLinks {
  constructor(
    readonly reaction: Reaction,
    readonly table: ReactionMassTable,
  ) {}

  async add(key: string): Promise<void> {
    const sql = this.reaction.reactions.wimp.sql
    const declaration = (await sql<Array<{id: number}>>`
      SELECT id FROM mass_declaration
       WHERE wimp = ${this.reaction.reactions.wimp.src}
         AND local_key = ${key}
         AND active = 1
    `)[0]
    if (!declaration) throw new Error(`Reaction ${this.reaction.key} references unavailable Mass ${key}`)
    await sql.unsafe(
      `INSERT OR IGNORE INTO ${this.table} (reaction, mass) VALUES (?, ?)`,
      [await this.reaction.id(), declaration.id],
    )
  }

  async remove(key: string): Promise<void> {
    await this.reaction.reactions.wimp.sql.unsafe(
      `DELETE FROM ${this.table}
        WHERE reaction = ?
          AND mass IN (
            SELECT id FROM mass_declaration WHERE wimp = ? AND local_key = ?
          )`,
      [await this.reaction.id(), this.reaction.reactions.wimp.src, key],
    )
  }

  async all(): Promise<string[]> {
    const rows = await this.reaction.reactions.wimp.sql.unsafe<Array<{key: string}>>(
      `SELECT declaration.local_key AS key
         FROM ${this.table} AS link
         JOIN mass_declaration AS declaration ON declaration.id = link.mass
        WHERE link.reaction = ?
        ORDER BY declaration.local_id, declaration.id`,
      [await this.reaction.id()],
    )
    return rows.map(({key}) => key)
  }

  async has(key: string): Promise<boolean> {
    const rows = await this.reaction.reactions.wimp.sql.unsafe<Array<{ok: number}>>(
      `SELECT 1 AS ok
         FROM ${this.table} AS link
         JOIN mass_declaration AS declaration ON declaration.id = link.mass
        WHERE link.reaction = ? AND declaration.wimp = ? AND declaration.local_key = ?
        LIMIT 1`,
      [await this.reaction.id(), this.reaction.reactions.wimp.src, key],
    )
    return rows.length === 1
  }

  async count(): Promise<number> {
    const row = (await this.reaction.reactions.wimp.sql.unsafe<Array<{count: number}>>(
      `SELECT COUNT(*) AS count FROM ${this.table} WHERE reaction = ?`,
      [await this.reaction.id()],
    ))[0]
    return Number(row?.count ?? 0)
  }
}

/**
Normalized Boundary declaration of one WIMP-local Reaction.

`sources`, `read`, `write`, `massRead`, `massWrite` and `states` expose only
declaration relations. Runtime source-to-target links are derived separately
from these rows and current Atom structure.
*/
export class Reaction {
  readonly read: ReactionRead
  readonly write: ReactionWrite
  readonly states: ReactionStates
  readonly massRead: ReactionMassLinks
  readonly massWrite: ReactionMassLinks

  constructor(
    readonly reactions: Reactions,
    readonly key: string,
  ) {
    this.read = new ReactionRead(this)
    this.write = new ReactionWrite(this)
    this.states = new ReactionStates(this)
    this.massRead = new ReactionMassLinks(this, "reaction_mass_read")
    this.massWrite = new ReactionMassLinks(this, "reaction_mass_write")
  }

  /**
   * Резолвит id строки `reaction` по (wimp, key). Throw если не найдено.
   */
  async id(): Promise<number> {
    const row = (
      await this.reactions.wimp.sql<Array<{ id: number }>>`
        SELECT id FROM reaction
        WHERE wimp = ${this.reactions.wimp.src} AND key = ${this.key}
        LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`reaction ${this.key} not found in wimp ${this.reactions.wimp.src}`)
    return row.id
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

  async sources(): Promise<ReactionSourceSelector[]> {
    const id = await this.id()
    const selectors = await this.reactions.wimp.sql<Array<{
      selectorOrder: number
      atom: string | null
      meta: string | null
      relation: ReactionSourceRelation | null
    }>>`
      SELECT selector_order AS selectorOrder, atom_ref AS atom, meta, relation
        FROM reaction_source_selector
       WHERE reaction = ${id}
       ORDER BY selector_order
    `
    return await Promise.all(selectors.map(async (selector) => ({
      ...(selector.atom === null ? {} : {atom: selector.atom as `atom:${string}`}),
      ...(selector.meta === null ? {} : {meta: selector.meta}),
      ...(selector.relation === null ? {} : {relation: selector.relation}),
      states: (await this.reactions.wimp.sql<Array<{state: string}>>`
        SELECT state FROM reaction_source_state
         WHERE reaction = ${id} AND selector_order = ${selector.selectorOrder}
         ORDER BY state_order
      `).map(({state}) => state) as [string, ...string[]],
    })))
  }

  async setSources(value: readonly ReactionSourceSelector[]): Promise<void> {
    const sources = normalizeSources(value)
    const id = await this.id()
    await this.reactions.wimp.sql.begin(async (sql) => {
      await sql`UPDATE reaction SET sources_json = ${JSON.stringify(sources)} WHERE id = ${id}`
      await sql`DELETE FROM reaction_source_selector WHERE reaction = ${id}`
      for (let selectorOrder = 0; selectorOrder < sources.length; selectorOrder++) {
        const source = sources[selectorOrder]!
        await sql`
          INSERT INTO reaction_source_selector (reaction, selector_order, atom_ref, meta, relation)
          VALUES (${id}, ${selectorOrder}, ${source.atom ?? null}, ${source.meta ?? null}, ${source.relation ?? null})
        `
        for (let stateOrder = 0; stateOrder < source.states.length; stateOrder++) {
          await sql`
            INSERT INTO reaction_source_state (reaction, selector_order, state_order, state)
            VALUES (${id}, ${selectorOrder}, ${stateOrder}, ${source.states[stateOrder]!})
          `
        }
      }
    })
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
