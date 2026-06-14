import type {SQL} from "bun"
import type {ValueKind} from "./value.t.ts"
import {Value, type AnyValue} from "./value.ts"

export class ActorFieldValue {
  constructor(
    private readonly sql: SQL,
    readonly actor: string,
    readonly field: string,
  ) {}

  async value(): Promise<AnyValue> {
    const row = (
      await this.sql<Array<{ value: string; kind: string }>>`
        SELECT av.value AS value, v.kind AS kind
        FROM actor_value av
        INNER JOIN value v ON v.uuid = av.value
        WHERE av.actor = ${this.actor} AND av.field = ${this.field}
        LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`actor_value (${this.actor}, ${this.field}) not found`)
    const found = await Value.get(this.sql, String(row.value))
    if (!found) throw new Error(`value ${row.value} missing for (${this.actor}, ${this.field}) [kind=${row.kind as ValueKind}]`)
    return found
  }

  static async get(sql: SQL, actor: string, field: string): Promise<ActorFieldValue | null> {
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM actor_value WHERE actor = ${actor} AND field = ${field} LIMIT 1
      `
    )[0]
    return row ? new ActorFieldValue(sql, actor, field) : null
  }
}
