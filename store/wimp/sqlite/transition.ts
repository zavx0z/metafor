import type { State } from "./state.ts"
import { Conditions } from "./condition.ts"

export class Transition {
  readonly conditions: Conditions

  constructor(
    readonly state: State,
    readonly toName: string,
  ) {
    this.conditions = new Conditions(this)
  }

  async uuid(): Promise<string> {
    const sql = this.state.superposition.wimp.sql
    const fromUuid = await this.state.uuid()
    const row = (
      await sql<Array<{ uuid: string }>>`
        SELECT transition.uuid AS uuid
        FROM transition
        INNER JOIN superposition AS target ON target.uuid = transition.to_superposition
        WHERE transition.from_superposition = ${fromUuid}
          AND target.name = ${this.toName}
        LIMIT 1
      `
    )[0]
    if (!row) {
      throw new Error(
        `transition ${this.state.name} → ${this.toName} not found in wimp ${this.state.superposition.wimp.src}`,
      )
    }
    return row.uuid
  }

  async position(): Promise<number> {
    const sql = this.state.superposition.wimp.sql
    const uuid = await this.uuid()
    const row = (
      await sql<Array<{ position: number }>>`
        SELECT position FROM transition WHERE uuid = ${uuid} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`transition ${uuid} not found`)
    return row.position
  }
}

export class Transitions {
  constructor(readonly state: State) {}

  /**
   * INSERT в `transition`. `toName` — имя target state (резолв в uuid через SQL).
   * Если target не существует — выбрасывает; caller обязан создать state заранее.
   * Position — auto (next).
   */
  async add(toName: string): Promise<Transition> {
    const sql = this.state.superposition.wimp.sql
    const src = this.state.superposition.wimp.src
    const fromUuid = await this.state.uuid()

    const targetRow = (
      await sql<Array<{ uuid: string }>>`
        SELECT uuid FROM superposition WHERE wimp = ${src} AND name = ${toName} LIMIT 1
      `
    )[0]
    if (!targetRow) {
      throw new Error(`Transitions.add: target state "${toName}" not found in wimp ${src}`)
    }

    const posRow = (
      await sql<Array<{ next: number }>>`
        SELECT COALESCE(MAX(position) + 1, 0) AS next
        FROM transition
        WHERE from_superposition = ${fromUuid}
      `
    )[0]
    const position = posRow?.next ?? 0

    const uuid = crypto.randomUUID()
    await sql`
      INSERT INTO transition (uuid, from_superposition, to_superposition, position)
      VALUES (${uuid}, ${fromUuid}, ${targetRow.uuid}, ${position})
    `
    return new Transition(this.state, toName)
  }

  async all(): Promise<Transition[]> {
    const sql = this.state.superposition.wimp.sql
    const fromUuid = await this.state.uuid()
    const rows = await sql<Array<{ to_name: string }>>`
      SELECT target.name AS to_name
      FROM transition
      INNER JOIN superposition AS target ON target.uuid = transition.to_superposition
      WHERE transition.from_superposition = ${fromUuid}
      ORDER BY transition.position
    `
    return rows.map((row) => new Transition(this.state, row.to_name))
  }

  async get(filter: { to: string }): Promise<Transition | null> {
    const sql = this.state.superposition.wimp.sql
    const fromUuid = await this.state.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM transition
        INNER JOIN superposition AS target ON target.uuid = transition.to_superposition
        WHERE transition.from_superposition = ${fromUuid}
          AND target.name = ${filter.to}
        LIMIT 1
      `
    )[0]
    return row ? new Transition(this.state, filter.to) : null
  }

  async count(): Promise<number> {
    const sql = this.state.superposition.wimp.sql
    const fromUuid = await this.state.uuid()
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM transition WHERE from_superposition = ${fromUuid}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const sql = this.state.superposition.wimp.sql
    const fromUuid = await this.state.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM transition WHERE from_superposition = ${fromUuid} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
