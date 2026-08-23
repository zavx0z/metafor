import type { Wimp } from "../wimp.ts"
import type { ProcessTypeValue } from "@boundary/types/wimp"
import { Process } from "./process.ts"

export class Processes {
  readonly #wimp: Wimp

  constructor(wimp: Wimp) {
    this.#wimp = wimp
  }

  get wimp(): Wimp {
    return this.#wimp
  }

  /**
   * INSERT в `process` (UNIQUE по wimp+key).
   * Идемпотентно: если process с таким key уже существует — возвращает existing
   * без обновления label/desc/type (симметрично `Superposition.add`).
   */
  async add(input: {
    key: string
    type: ProcessTypeValue
    label?: string | null | undefined
    desc?: string | null | undefined
  }): Promise<Process> {
    const sql = this.wimp.sql
    const src = this.wimp.src

    const existing = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process WHERE wimp = ${src} AND key = ${input.key} LIMIT 1
      `
    )[0]
    if (existing) return new Process(this, input.key)

    const row = (await sql<Array<{id: number}>>`
      INSERT INTO process (wimp, key, type, label, desc)
      VALUES (${src}, ${input.key}, ${input.type}, ${input.label ?? null}, ${input.desc ?? null})
      RETURNING id
    `)[0]
    return new Process(this, input.key)
  }

  async all(): Promise<Process[]> {
    const rows = await this.wimp.sql<Array<{ key: string }>>`
      SELECT key FROM process WHERE wimp = ${this.wimp.src} ORDER BY rowid
    `
    return rows.map((row) => new Process(this, row.key))
  }

  async get(filter: { key: string }): Promise<Process | null> {
    const row = (
      await this.wimp.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process WHERE wimp = ${this.wimp.src} AND key = ${filter.key} LIMIT 1
      `
    )[0]
    return row ? new Process(this, filter.key) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.wimp.sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM process WHERE wimp = ${this.wimp.src}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.wimp.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process WHERE wimp = ${this.wimp.src} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
