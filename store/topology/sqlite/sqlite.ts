import type {SQL} from "bun"
import topologySql from "./topology.sql" with {type: "text"}
import topologyFuzzyStateSql from "./topology_fuzzy_state.sql" with {type: "text"}
import {buildTopology, decodeTopologyRow} from "./topology.ts"
import type {AnyTopology} from "./topology.ts"
import type {TopologyInput, TopologyRecord} from "./topology.t.ts"
import {emitGravitonAdd} from "../../force.ts"

export class StoreTopologySqlite {
  private constructor(private readonly sql: SQL) {}

  static async open(sql: SQL): Promise<StoreTopologySqlite> {
    await sql.unsafe(
      [topologySql, topologyFuzzyStateSql]
        .map((sql) => sql.trim())
        .filter(Boolean)
        .join("\n\n")
        .trim(),
    )
    return new StoreTopologySqlite(sql)
  }

  /**
   * Создаёт topology-узел (Fuzzy/Axion/Macho). Polymorphic parent: ровно один из
   * `parentActor`/`parentTopology` должен быть задан.
   * Position вычисляется автоматически как next среди siblings.
   */
  async create(input: TopologyInput): Promise<AnyTopology> {
    const siblingCount = (
      await this.sql<Array<{count: number}>>`
        SELECT COUNT(*) AS count FROM topology
        WHERE parent_actor IS ${input.parentActor}
          AND parent_topology IS ${input.parentTopology}
      `
    )[0]?.count ?? 0
    const position = Number(siblingCount)
    await this.sql`
      INSERT INTO topology (uuid, parent_actor, parent_topology, kind, position)
      VALUES (${input.uuid}, ${input.parentActor}, ${input.parentTopology}, ${input.kind}, ${position})
    `
    emitGravitonAdd(input.uuid, "topology")
    return buildTopology(this.sql, {...input, position})
  }

  async get(uuid: string): Promise<AnyTopology | null> {
    const row = (
      await this.sql<Array<Record<string, unknown>>>`
        SELECT uuid, parent_actor, parent_topology, kind, position
        FROM topology
        WHERE uuid = ${uuid}
        LIMIT 1
      `
    )[0]
    return row ? buildTopology(this.sql, decodeTopologyRow(row)) : null
  }

  async head(uuid: string): Promise<TopologyRecord | null> {
    const row = (
      await this.sql<Array<Record<string, unknown>>>`
        SELECT uuid, parent_actor, parent_topology, kind, position
        FROM topology
        WHERE uuid = ${uuid}
      `
    )[0]
    return row ? decodeTopologyRow(row) : null
  }

  /**
   * Все topology-узлы, для которых указанный actor — родитель (parent_actor=actorUuid).
   */
  async childrenOfActor(actorUuid: string): Promise<AnyTopology[]> {
    const rows = await this.sql<Array<Record<string, unknown>>>`
      SELECT uuid, parent_actor, parent_topology, kind, position
      FROM topology
      WHERE parent_actor = ${actorUuid}
      ORDER BY position
    `
    return rows.map((row) => buildTopology(this.sql, decodeTopologyRow(row)))
  }
}

export {Axion, Fuzzy, Macho, TopologyChildren, buildTopology, decodeTopologyRow} from "./topology.ts"
export type {AnyTopology} from "./topology.ts"
