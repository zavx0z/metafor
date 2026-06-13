import type { State } from "./state.ts"
import { Conditions } from "./condition.ts"
import {emitGravitonAdd} from "../../../force.ts"

export class Transition {
  readonly conditions: Conditions

  constructor(
    readonly state: State,
    readonly toName: string,
  ) {
    this.conditions = new Conditions(this)
  }

  async uuid(): Promise<string> {
    const sql = this.state.states.wimp.sql
    const fromUuid = await this.state.uuid()
    const row = (
      await sql<Array<{ uuid: string }>>`
        SELECT transition.uuid AS uuid
        FROM transition
        INNER JOIN state AS target ON target.uuid = transition.to_state
        WHERE transition.from_state = ${fromUuid}
          AND target.name = ${this.toName}
        LIMIT 1
      `
    )[0]
    if (!row) {
      throw new Error(
        `transition ${this.state.name} → ${this.toName} not found in wimp ${this.state.states.wimp.src}`,
      )
    }
    return row.uuid
  }

  async position(): Promise<number> {
    const sql = this.state.states.wimp.sql
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
    const sql = this.state.states.wimp.sql
    const src = this.state.states.wimp.src
    const fromUuid = await this.state.uuid()

    const targetRow = (
      await sql<Array<{ uuid: string }>>`
        SELECT uuid FROM state WHERE wimp = ${src} AND name = ${toName} LIMIT 1
      `
    )[0]
    if (!targetRow) {
      throw new Error(`Transitions.add: target state "${toName}" not found in wimp ${src}`)
    }

    const posRow = (
      await sql<Array<{ next: number }>>`
        SELECT COALESCE(MAX(position) + 1, 0) AS next
        FROM transition
        WHERE from_state = ${fromUuid}
      `
    )[0]
    const position = posRow?.next ?? 0

    const uuid = crypto.randomUUID()
    await sql`
      INSERT INTO transition (uuid, from_state, to_state, position)
      VALUES (${uuid}, ${fromUuid}, ${targetRow.uuid}, ${position})
    `
    emitGravitonAdd(uuid, "transition")
    return new Transition(this.state, toName)
  }

  async all(): Promise<Transition[]> {
    const sql = this.state.states.wimp.sql
    const fromUuid = await this.state.uuid()
    const rows = await sql<Array<{ to_name: string }>>`
      SELECT target.name AS to_name
      FROM transition
      INNER JOIN state AS target ON target.uuid = transition.to_state
      WHERE transition.from_state = ${fromUuid}
      ORDER BY transition.position
    `
    return rows.map((row) => new Transition(this.state, row.to_name))
  }

  async get(filter: { to: string }): Promise<Transition | null> {
    const sql = this.state.states.wimp.sql
    const fromUuid = await this.state.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM transition
        INNER JOIN state AS target ON target.uuid = transition.to_state
        WHERE transition.from_state = ${fromUuid}
          AND target.name = ${filter.to}
        LIMIT 1
      `
    )[0]
    return row ? new Transition(this.state, filter.to) : null
  }

  async count(): Promise<number> {
    const sql = this.state.states.wimp.sql
    const fromUuid = await this.state.uuid()
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM transition WHERE from_state = ${fromUuid}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const sql = this.state.states.wimp.sql
    const fromUuid = await this.state.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM transition WHERE from_state = ${fromUuid} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
