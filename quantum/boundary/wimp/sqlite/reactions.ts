import type { Wimp } from "./wimp.ts"
import type {ReactionSourceSelector} from "@metafor/types/metafor/reactions"
import { Reaction } from "./reaction.ts"

/**
Коллекция Reaction одного WIMP.

`add()` создаёт одну декларацию idempotent по `wimp + key`; exact selectors,
Field/Mass dependencies и active target States принадлежат полученному
`Reaction`.
*/
export class Reactions {
  readonly #wimp: Wimp

  constructor(wimp: Wimp) {
    this.#wimp = wimp
  }

  get wimp(): Wimp {
    return this.#wimp
  }

  /**
  Вставляет Reaction с уникальным `wimp + key`.

  Повтор существующего key возвращает ту же декларацию без скрытой замены её
  selectors, metadata или action source.
  */
  async add(input: {
    key: string
    label: string
    desc?: string | null | undefined
    sources: readonly ReactionSourceSelector[]
    src: string
  }): Promise<Reaction> {
    const sql = this.wimp.sql
    const src = this.wimp.src

    const existing = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM reaction WHERE wimp = ${src} AND key = ${input.key} LIMIT 1
      `
    )[0]
    if (existing) return new Reaction(this, input.key)

    await sql`
      INSERT INTO reaction (wimp, key, label, desc, sources_json, update_source)
      VALUES (${src}, ${input.key}, ${input.label}, ${input.desc ?? null}, ${JSON.stringify(input.sources)}, ${input.src})
      RETURNING id
    `
    const reaction = new Reaction(this, input.key)
    await reaction.setSources(input.sources)
    return reaction
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
