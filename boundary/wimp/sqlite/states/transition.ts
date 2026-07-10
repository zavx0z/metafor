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

  async id(): Promise<number> {
    const sql = this.state.states.wimp.sql
    const fromId = await this.state.id()
    const row = (
      await sql<Array<{ id: number }>>`
        SELECT transition.id AS id
        FROM transition
        INNER JOIN state AS target ON target.id = transition.to_state
        WHERE transition.from_state = ${fromId}
          AND target.name = ${this.toName}
        LIMIT 1
      `
    )[0]
    if (!row) {
      throw new Error(
        `transition ${this.state.name} → ${this.toName} not found in wimp ${this.state.states.wimp.src}`,
      )
    }
    return row.id
  }

  async position(): Promise<number> {
    const sql = this.state.states.wimp.sql
    const id = await this.id()
    const row = (
      await sql<Array<{ position: number }>>`
        SELECT position FROM transition WHERE id = ${id} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`transition ${id} not found`)
    return row.position
  }
}

export class Transitions {
  constructor(readonly state: State) {}

  /**
   * INSERT в `transition`. `toName` — имя target state (резолв в id через SQL).
   * Если target не существует — выбрасывает; caller обязан создать state заранее.
   * Position — auto (next).
   */
  async add(toName: string): Promise<Transition> {
    const sql = this.state.states.wimp.sql
    const src = this.state.states.wimp.src
    const fromId = await this.state.id()

    const targetRow = (
      await sql<Array<{ id: number }>>`
        SELECT id FROM state WHERE wimp = ${src} AND name = ${toName} LIMIT 1
      `
    )[0]
    if (!targetRow) {
      throw new Error(`Transitions.add: target state "${toName}" not found in wimp ${src}`)
    }

    const posRow = (
      await sql<Array<{ next: number }>>`
        SELECT COALESCE(MAX(position) + 1, 0) AS next
        FROM transition
        WHERE from_state = ${fromId}
      `
    )[0]
    const position = posRow?.next ?? 0

    const row = (await sql<Array<{id: number}>>`
      INSERT INTO transition (from_state, to_state, position)
      VALUES (${fromId}, ${targetRow.id}, ${position})
      RETURNING id
    `)[0]
    return new Transition(this.state, toName)
  }

  async all(): Promise<Transition[]> {
    const sql = this.state.states.wimp.sql
    const fromId = await this.state.id()
    const rows = await sql<Array<{ to_name: string }>>`
      SELECT target.name AS to_name
      FROM transition
      INNER JOIN state AS target ON target.id = transition.to_state
      WHERE transition.from_state = ${fromId}
      ORDER BY transition.position
    `
    return rows.map((row) => new Transition(this.state, row.to_name))
  }

  async get(filter: { to: string }): Promise<Transition | null> {
    const sql = this.state.states.wimp.sql
    const fromId = await this.state.id()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM transition
        INNER JOIN state AS target ON target.id = transition.to_state
        WHERE transition.from_state = ${fromId}
          AND target.name = ${filter.to}
        LIMIT 1
      `
    )[0]
    return row ? new Transition(this.state, filter.to) : null
  }

  async count(): Promise<number> {
    const sql = this.state.states.wimp.sql
    const fromId = await this.state.id()
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM transition WHERE from_state = ${fromId}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const sql = this.state.states.wimp.sql
    const fromId = await this.state.id()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM transition WHERE from_state = ${fromId} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
