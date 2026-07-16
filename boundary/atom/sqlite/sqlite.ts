import type {SQL} from "bun"
import atomSql from "./atom.sql" with {type: "text"}
import valueSql from "./value.sql" with {type: "text"}
import atomValueSql from "./atom_value.sql" with {type: "text"}
import stateSql from "./state.sql" with {type: "text"}
import {Atom, AtomRoots, decodeAtomRow} from "./atom.ts"
import {Value} from "./value.ts"
import type { AtomRecord, AtomRows } from "@metafor/types/boundary/atom"
import {AtomFieldValue} from "./atom_value.ts"

export class BoundaryAtomSqlite {
  readonly roots: AtomRoots
  readonly value: {
    get(id: number): Promise<Value | null>
  }
  readonly link: {
    get(atom: number, field: number): Promise<AtomFieldValue | null>
  }

  private constructor(private readonly sql: SQL) {
    this.roots = new AtomRoots(sql)
    this.value = {
      get: (id: number): Promise<Value | null> => Value.get(sql, id),
    }
    this.link = {
      get: (atom: number, field: number): Promise<AtomFieldValue | null> => AtomFieldValue.get(sql, atom, field),
    }
  }

  static async open(sql: SQL): Promise<BoundaryAtomSqlite> {
    await sql.unsafe(
      [atomSql, valueSql, atomValueSql, stateSql]
        .map((sql) => sql.trim())
        .filter(Boolean)
        .join("\n\n")
        .trim(),
    )
    return new BoundaryAtomSqlite(sql)
  }

  /** Записывает atom snapshot одной транзакцией: head + values + atom_state. */
  async create(rows: AtomRows): Promise<Atom> {
    const atomId = await Atom.writeRows(this.sql, rows)
    const atom = new Atom(this.sql, atomId)
    return atom
  }

  async get(id: number): Promise<Atom | null> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM atom WHERE id = ${id} LIMIT 1
      `
    )[0]
    return row ? new Atom(this.sql, id) : null
  }

  async findByParent(input: {
    wimp: string
    parent: {kind: "atom"; id: number} | {kind: "topology"; id: number} | null
  }): Promise<Atom | null> {
    const parentAtom = input.parent?.kind === "atom" ? input.parent.id : null
    const parentTopology = input.parent?.kind === "topology" ? input.parent.id : null
    const row = (
      await this.sql<Array<{id: number}>>`
        SELECT id
        FROM atom
        WHERE wimp = ${input.wimp}
          AND parent_atom IS ${parentAtom}
          AND parent_topology IS ${parentTopology}
        LIMIT 1
      `
    )[0]
    return row ? new Atom(this.sql, Number(row.id)) : null
  }

  async head(id: number): Promise<AtomRecord | null> {
    const row = (
      await this.sql<Array<Record<string, unknown>>>`
        SELECT id, parent_atom, parent_topology, wimp, position FROM atom WHERE id = ${id}
      `
    )[0]
    return row ? decodeAtomRow(row) : null
  }
}

export {Atom, AtomChildren, AtomRoots, AtomValues} from "./atom.ts"
export {AtomFieldValue} from "./atom_value.ts"
export {BooleanValue, EnumValue, ListValue, NullValue, NumberValue, StringValue, Value} from "./value.ts"
