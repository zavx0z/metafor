import type {SQL} from "bun"
import type { ValueKind } from "@metafor/types/boundary/value"
import {Value} from "./value.ts"

export class AtomFieldValue {
  constructor(
    private readonly sql: SQL,
    readonly atom: number,
    readonly field: number,
  ) {}

  async value(): Promise<Value> {
    const row = (
      await this.sql<Array<{ value: number; kind: string }>>`
        SELECT av.value AS value, v.kind AS kind
        FROM atom_value av
        INNER JOIN value v ON v.id = av.value
        WHERE av.atom = ${this.atom} AND av.field = ${this.field}
        LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`atom_value (${this.atom}, ${this.field}) not found`)
    const found = await Value.get(this.sql, Number(row.value))
    if (!found) throw new Error(`value ${row.value} missing for (${this.atom}, ${this.field}) [kind=${row.kind as ValueKind}]`)
    return found
  }

  static async get(sql: SQL, atom: number, field: number): Promise<AtomFieldValue | null> {
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM atom_value WHERE atom = ${atom} AND field = ${field} LIMIT 1
      `
    )[0]
    return row ? new AtomFieldValue(sql, atom, field) : null
  }
}
