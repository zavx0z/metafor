import type { Wimp } from "./wimp.ts"
import { State } from "./state.ts"

export class Superposition {
  constructor(readonly wimp: Wimp) {}

  /**
   * INSERT в `superposition` с auto-position (следующий по count).
   * Если state с таким именем уже есть — возвращает existing (idempotent).
   */
  async add(name: string): Promise<State> {
    const sql = this.wimp.sql
    const src = this.wimp.src

    const existing = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM superposition WHERE wimp = ${src} AND name = ${name} LIMIT 1
      `
    )[0]
    if (existing) return new State(this, name)

    const posRow = (
      await sql<Array<{ next: number }>>`
        SELECT COALESCE(MAX(position) + 1, 0) AS next FROM superposition WHERE wimp = ${src}
      `
    )[0]
    const position = posRow?.next ?? 0

    const uuid = crypto.randomUUID()
    await sql`INSERT INTO superposition (uuid, wimp, name, position) VALUES (${uuid}, ${src}, ${name}, ${position})`
    return new State(this, name)
  }

  async all(): Promise<State[]> {
    const rows = await this.wimp.sql<Array<{ name: string }>>`
      SELECT name FROM superposition WHERE wimp = ${this.wimp.src} ORDER BY position
    `
    return rows.map((row) => new State(this, row.name))
  }

  async get(filter: { name: string }): Promise<State | null> {
    const row = (
      await this.wimp.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM superposition
        WHERE wimp = ${this.wimp.src} AND name = ${filter.name}
        LIMIT 1
      `
    )[0]
    return row ? new State(this, filter.name) : null
  }

  async initial(): Promise<State | null> {
    const row = (
      await this.wimp.sql<Array<{ name: string }>>`
        SELECT name FROM superposition WHERE wimp = ${this.wimp.src} ORDER BY position LIMIT 1
      `
    )[0]
    return row ? new State(this, row.name) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.wimp.sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM superposition WHERE wimp = ${this.wimp.src}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.wimp.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM superposition WHERE wimp = ${this.wimp.src} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
