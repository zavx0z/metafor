import type { Wimp } from "./wimp.ts"
import { Reaction } from "./reaction.ts"

/**
 * Коллекция реакций для одного wimp.
 * Гранулярный API: `add()` создаёт одну реакцию (idempotent по wimp+key),
 * связи (read/write/states) добавляются через sub-ORM на `Reaction`.
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
   * INSERT в `reaction` (UNIQUE по wimp+key).
   * Идемпотентно: если reaction с таким key уже существует — возвращает existing
   * без обновления label/desc/cond/src.
   */
  async add(input: {
    key: string
    label: string
    desc?: string | null | undefined
    cond: string
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

    const uuid = crypto.randomUUID()
    await sql`
      INSERT INTO reaction (uuid, wimp, key, label, desc, cond_source, update_source)
      VALUES (${uuid}, ${src}, ${input.key}, ${input.label}, ${input.desc ?? null}, ${input.cond}, ${input.src})
    `
    return new Reaction(this, input.key)
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
