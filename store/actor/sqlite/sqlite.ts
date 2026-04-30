import type { SQL } from "bun"
import type { ActorRows } from "./actor.t.ts"
import actorSql from "./actor.sql" with { type: "text" }
import valueSql from "./value.sql" with { type: "text" }
import actorValueSql from "./actor_value.sql" with { type: "text" }
import stateSql from "./state.sql" with { type: "text" }
import { writeActorRows } from "./actor.C.ts"
import { deleteActor } from "./actor.D.ts"
import { forkValue, shareValue } from "./actor_value.U.ts"
import { Actor, ActorRoots } from "./actor.ts"
import { Value } from "./value.ts"
import type { ActorRecord } from "./actor.t.ts"
import type { ActorValueRecord } from "./actor_value.t.ts"

const decodeActorRow = (row: Record<string, unknown>): ActorRecord => ({
  uuid: String(row.uuid),
  parent: row.parent === null || row.parent === undefined ? null : String(row.parent),
  meta: String(row.meta),
  position: Number(row.position),
})

export class StoreActorSqlite {
  readonly roots: ActorRoots
  readonly value: {
    get(uuid: string): Promise<Value | null>
  }
  readonly link: {
    get(actor: string, field: string): Promise<ActorValueRecord | null>
    share(actor: string, field: string, value: string): Promise<void>
    fork(actor: string, field: string): Promise<string>
  }

  private constructor(private readonly sql: SQL) {
    this.roots = new ActorRoots(sql)
    this.value = {
      get: (uuid: string): Promise<Value | null> => Value.get(sql, uuid),
    }
    this.link = {
      get: async (actor: string, field: string): Promise<ActorValueRecord | null> => {
        const row = (
          await sql<Array<{ actor: string; field: string; value: string }>>`
            SELECT actor, field, value FROM actor_value WHERE actor = ${actor} AND field = ${field} LIMIT 1
          `
        )[0]
        return row ? { actor: String(row.actor), field: String(row.field), value: String(row.value) } : null
      },
      share: (actor: string, field: string, value: string): Promise<void> => shareValue(sql, actor, field, value),
      fork: (actor: string, field: string): Promise<string> => forkValue(sql, actor, field),
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

  async create(rows: ActorRows): Promise<Actor> {
    await writeActorRows(this.sql, rows)
    return new Actor(this.sql, rows.actor.uuid)
  }

  async get(uuid: string): Promise<Actor | null> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM actor WHERE uuid = ${uuid} LIMIT 1
      `
    )[0]
    return row ? new Actor(this.sql, uuid) : null
  }

  delete(uuid: string): Promise<void> {
    return deleteActor(this.sql, uuid)
  }

  async head(uuid: string): Promise<ActorRecord | null> {
    const row = (
      await this.sql<Array<Record<string, unknown>>>`
        SELECT uuid, parent, meta, position FROM actor WHERE uuid = ${uuid}
      `
    )[0]
    return row ? decodeActorRow(row) : null
  }

  async reset(): Promise<void> {
    await this.sql.begin(async (tx) => {
      for (const table of [
        "actor_state",
        "actor_value",
        "value_list_item",
        "value_enum",
        "value_string",
        "value_number",
        "value_boolean",
        "value",
        "actor",
      ] as const) {
        await tx.unsafe(`DELETE FROM ${table}`)
      }
    })
  }
}

export { Actor, ActorChildren, ActorRoots, ActorValues } from "./actor.ts"
export { ActorFieldValue } from "./actor_value.ts"
export { BooleanValue, EnumValue, ListValue, NullValue, NumberValue, StringValue, Value } from "./value.ts"
export type { AnyValue } from "./value.ts"
export type { ValueItemRecord } from "./value.t.ts"
