import type {SQL} from "bun"
import topologySql from "./topology.sql" with {type: "text"}
import topologyFuzzyStateSql from "./topology_fuzzy_state.sql" with {type: "text"}
import {buildTopology, decodeTopologyRow} from "./topology.ts"
import type {TopologyBase} from "./topology.ts"
import type { TopologyInput, TopologyRecord } from "@metafor/types/boundary/topology"

const isStoredId = (id: number | null | undefined): id is number =>
  typeof id === "number" && Number.isInteger(id) && id > 0

export class BoundaryTopologySqlite {
  private constructor(private readonly sql: SQL) {}

  static async open(sql: SQL): Promise<BoundaryTopologySqlite> {
    await sql.unsafe(
      [topologySql, topologyFuzzyStateSql]
        .map((sql) => sql.trim())
        .filter(Boolean)
        .join("\n\n")
        .trim(),
    )
    return new BoundaryTopologySqlite(sql)
  }

  /**
   * Создаёт topology-узел (Fuzzy/Axion/Macho). Polymorphic parent: ровно один из
   * `parentAtom`/`parentTopology` должен быть задан.
   * Position вычисляется автоматически как next среди siblings.
   */
  async create(input: TopologyInput): Promise<TopologyBase> {
    const siblingCount = (
      await this.sql<Array<{count: number}>>`
        SELECT COUNT(*) AS count FROM topology
        WHERE parent_atom IS ${input.parentAtom}
          AND parent_topology IS ${input.parentTopology}
      `
    )[0]?.count ?? 0
    const position = Number(siblingCount)
    const id = isStoredId(input.id)
      ? input.id
      : (await this.sql<Array<{id: number}>>`
          INSERT INTO topology (parent_atom, parent_topology, kind, position)
          VALUES (${input.parentAtom}, ${input.parentTopology}, ${input.kind}, ${position})
          RETURNING id
        `)[0]?.id
    if (!id) throw new Error("BoundaryTopologySqlite.create: insert did not return id")
    if (isStoredId(input.id)) {
      await this.sql`
        INSERT INTO topology (id, parent_atom, parent_topology, kind, position)
        VALUES (${id}, ${input.parentAtom}, ${input.parentTopology}, ${input.kind}, ${position})
      `
    }
    const topology = {...input, id, position}
    return buildTopology(this.sql, topology)
  }

  async get(id: number): Promise<TopologyBase | null> {
    const row = (
      await this.sql<Array<Record<string, unknown>>>`
        SELECT id, parent_atom, parent_topology, kind, position
        FROM topology
        WHERE id = ${id}
        LIMIT 1
      `
    )[0]
    return row ? buildTopology(this.sql, decodeTopologyRow(row)) : null
  }

  async head(id: number): Promise<TopologyRecord | null> {
    const row = (
      await this.sql<Array<Record<string, unknown>>>`
        SELECT id, parent_atom, parent_topology, kind, position
        FROM topology
        WHERE id = ${id}
      `
    )[0]
    return row ? decodeTopologyRow(row) : null
  }

  /**
   * Все topology-узлы, для которых указанный atom — родитель (parent_atom=atomId).
   */
  async childrenOfAtom(atomId: number): Promise<TopologyBase[]> {
    const rows = await this.sql<Array<Record<string, unknown>>>`
      SELECT id, parent_atom, parent_topology, kind, position
      FROM topology
      WHERE parent_atom = ${atomId}
      ORDER BY position
    `
    return rows.map((row) => buildTopology(this.sql, decodeTopologyRow(row)))
  }
}

export {Axion, Fuzzy, Macho, TopologyChildren, buildTopology, decodeTopologyRow} from "./topology.ts"
