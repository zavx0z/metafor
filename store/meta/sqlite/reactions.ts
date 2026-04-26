/**
 * Сущность `reaction` + reaction_superposition + read/write в DSL-relational схеме.
 *
 * Якорный файл сущности — под ним группируются:
 * - `reactions.sql` — DDL (4 таблицы: reaction, reaction_superposition,
 *   reaction_read, reaction_write)
 * - `reactions.t.ts` — типы (ReactionRow, FieldUuidByKey, StateUuidByName)
 * - `reactions.C.ts` — `createReactions(db, meta, src, fieldUuids, stateUuids)`
 * - `reactions.G.ts` — `getReactions(db, src, fieldKeys)` (bulk-loader)
 *
 * ORM-классы `Reaction` / `Reactions` — в этом файле; каждое свойство —
 * отдельный getter (или setter для редактируемых строковых скаляров).
 */

import type { SQL } from "bun"

/**
 * Одна реакция декларации. Хранит `(sql, metaSrc, key)`. Каждое свойство
 * подгружается отдельным точечным запросом, без in-memory кеша.
 */
export class Reaction {
  constructor(
    private readonly sql: SQL,
    private readonly metaSrc: string,
    readonly key: string,
  ) {}

  /** Человекочитаемая метка реакции. */
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

  /** Описание (или `undefined`, если не задано). */
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

  /** Source-код условия активации реакции (`cond`). */
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

  /** Source-код update-функции (DSL `src`). */
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

  /** Список ключей полей, которые реакция читает (в порядке привязки). */
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

  /** Список ключей полей, которые реакция пишет (в порядке привязки). */
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

  /** Список states, в которых реакция активна (в порядке привязки). */
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

/** Django-style manager для реакций одной меты. */
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
