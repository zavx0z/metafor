import type {SQL} from "bun"
import actorSql from "./actor.sql" with {type: "text"}
import valueSql from "./value.sql" with {type: "text"}
import actorValueSql from "./actor_value.sql" with {type: "text"}
import stateSql from "./state.sql" with {type: "text"}
import {Actor, ActorRoots} from "./actor.ts"
import {Value, type AnyValue} from "./value.ts"
import type {ActorRecord} from "./actor.t.ts"
import {ActorFieldValue} from "./actor_value.ts"

const decodeActorRow = (row: Record<string, unknown>): ActorRecord => ({
  uuid: String(row.uuid),
  parent: row.parent === null || row.parent === undefined ? null : String(row.parent),
  meta: String(row.meta),
  position: Number(row.position),
})

export class StoreActorSqlite {
  readonly roots: ActorRoots
  readonly value: {
    get(uuid: string): Promise<AnyValue | null>
  }
  readonly link: {
    get(actor: string, field: string): Promise<ActorFieldValue | null>
  }

  private constructor(private readonly sql: SQL) {
    this.roots = new ActorRoots(sql)
    this.value = {
      get: (uuid: string): Promise<AnyValue | null> => Value.get(sql, uuid),
    }
    this.link = {
      get: (actor: string, field: string): Promise<ActorFieldValue | null> => ActorFieldValue.get(sql, actor, field),
    }
  }

  static async open(sql: SQL): Promise<StoreActorSqlite> {
    await sql.unsafe(
      [actorSql, valueSql, actorValueSql, stateSql]
        .map((sql) => sql.trim())
        .filter(Boolean)
        .join("\n\n")
        .trim(),
    )
    return new StoreActorSqlite(sql)
  }

  async get(uuid: string): Promise<Actor | null> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM actor WHERE uuid = ${uuid} LIMIT 1
      `
    )[0]
    return row ? new Actor(this.sql, uuid) : null
  }

  async head(uuid: string): Promise<ActorRecord | null> {
    const row = (
      await this.sql<Array<Record<string, unknown>>>`
        SELECT uuid, parent, meta, position FROM actor WHERE uuid = ${uuid}
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
