import type {SQL} from "bun"
import actorSql from "./actor.sql" with {type: "text"}
import valueSql from "./value.sql" with {type: "text"}
import actorValueSql from "./actor_value.sql" with {type: "text"}
import stateSql from "./state.sql" with {type: "text"}
import {Actor, ActorRoots, decodeActorRow} from "./actor.ts"
import {Value, type AnyValue} from "./value.ts"
import type {ActorRecord, ActorRows} from "./actor.t.ts"
import {ActorFieldValue} from "./actor_value.ts"
import {emitForceParts} from "../../force.ts"

export class BoundaryActorSqlite {
  readonly roots: ActorRoots
  readonly value: {
    get(id: number): Promise<AnyValue | null>
  }
  readonly link: {
    get(actor: number, field: number): Promise<ActorFieldValue | null>
  }

  private constructor(private readonly sql: SQL) {
    this.roots = new ActorRoots(sql)
    this.value = {
      get: (id: number): Promise<AnyValue | null> => Value.get(sql, id),
    }
    this.link = {
      get: (actor: number, field: number): Promise<ActorFieldValue | null> => ActorFieldValue.get(sql, actor, field),
    }
  }

  static async open(sql: SQL): Promise<BoundaryActorSqlite> {
    await sql.unsafe(
      [actorSql, valueSql, actorValueSql, stateSql]
        .map((sql) => sql.trim())
        .filter(Boolean)
        .join("\n\n")
        .trim(),
    )
    return new BoundaryActorSqlite(sql)
  }

  /** Записывает actor snapshot одной транзакцией: head + values + actor_state. */
  async create(rows: ActorRows): Promise<Actor> {
    const actorId = await Actor.writeRows(this.sql, rows)
    const actor = new Actor(this.sql, actorId)
    emitForceParts([{part: "graviton", op: "add", path: "actor", value: await actor.rows()}])
    return actor
  }

  async get(id: number): Promise<Actor | null> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM actor WHERE id = ${id} LIMIT 1
      `
    )[0]
    return row ? new Actor(this.sql, id) : null
  }

  async findByParent(input: {
    wimp: string
    parent: {kind: "actor"; id: number} | {kind: "topology"; id: number} | null
  }): Promise<Actor | null> {
    const parentActor = input.parent?.kind === "actor" ? input.parent.id : null
    const parentTopology = input.parent?.kind === "topology" ? input.parent.id : null
    const row = (
      await this.sql<Array<{id: number}>>`
        SELECT id
        FROM actor
        WHERE wimp = ${input.wimp}
          AND parent_actor IS ${parentActor}
          AND parent_topology IS ${parentTopology}
        LIMIT 1
      `
    )[0]
    return row ? new Actor(this.sql, Number(row.id)) : null
  }

  async head(id: number): Promise<ActorRecord | null> {
    const row = (
      await this.sql<Array<Record<string, unknown>>>`
        SELECT id, parent_actor, parent_topology, wimp, position FROM actor WHERE id = ${id}
      `
    )[0]
    return row ? decodeActorRow(row) : null
  }
}

export {Actor, ActorChildren, ActorRoots, ActorValues} from "./actor.ts"
export {ActorFieldValue} from "./actor_value.ts"
export {BooleanValue, EnumValue, ListValue, NullValue, NumberValue, StringValue, Value} from "./value.ts"
export type {AnyValue} from "./value.ts"
export type {ValueItemRecord} from "./value.t.ts"
