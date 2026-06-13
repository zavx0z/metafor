import type { Wimp } from "../wimp.ts"
import { State } from "./state.ts"
import {emitGravitonAdd} from "../../../force.ts"

export class States {
  readonly #wimp: Wimp

  constructor(wimp: Wimp) {
    this.#wimp = wimp
  }

  get wimp(): Wimp {
    return this.#wimp
  }

  /**
   * INSERT в `state` с auto-position (следующий по count).
   * Если state с таким именем уже есть — возвращает existing (idempotent).
   */
  async add(name: string): Promise<State> {
    const sql = this.wimp.sql
    const src = this.wimp.src

    const existing = (
      await sql<Array<{ ok: number }>>`
          SELECT 1 AS ok
          FROM state
          WHERE wimp = ${src}
            AND name = ${name}
          LIMIT 1
      `
    )[0]
    if (existing) return new State(this, name)

    const posRow = (
      await sql<Array<{ next: number }>>`
        SELECT COALESCE(MAX(position) + 1, 0) AS next FROM state WHERE wimp = ${src}
      `
    )[0]
    const position = posRow?.next ?? 0

    const uuid = crypto.randomUUID()
    await sql`INSERT INTO state (uuid, wimp, name, position) VALUES (${uuid}, ${src}, ${name}, ${position})`
    emitGravitonAdd(uuid, "state")
    return new State(this, name)
  }

  async all(): Promise<State[]> {
    const rows = await this.wimp.sql<Array<{ name: string }>>`
      SELECT name FROM state WHERE wimp = ${this.wimp.src} ORDER BY position
    `
    return rows.map((row) => new State(this, row.name))
  }

  async get(filter: { name: string }): Promise<State | null> {
    const row = (
      await this.wimp.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM state
        WHERE wimp = ${this.wimp.src} AND name = ${filter.name}
        LIMIT 1
      `
    )[0]
    return row ? new State(this, filter.name) : null
  }

  async initial(): Promise<State | null> {
    const row = (
      await this.wimp.sql<Array<{ name: string }>>`
        SELECT name FROM state WHERE wimp = ${this.wimp.src} ORDER BY position LIMIT 1
      `
    )[0]
    return row ? new State(this, row.name) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.wimp.sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM state WHERE wimp = ${this.wimp.src}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.wimp.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM state WHERE wimp = ${this.wimp.src} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
