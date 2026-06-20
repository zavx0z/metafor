import type {SQL} from "bun"
import type {TopologyKind, TopologyRecord} from "./topology.t.ts"

export const decodeTopologyRow = (row: Record<string, unknown>): TopologyRecord => ({
  id: Number(row.id),
  parentActor: row.parent_actor === null || row.parent_actor === undefined ? null : Number(row.parent_actor),
  parentTopology:
    row.parent_topology === null || row.parent_topology === undefined ? null : Number(row.parent_topology),
  kind: String(row.kind) as TopologyKind,
  position: Number(row.position),
})

/**
 * Дочерние topology-узлы, у которых parent — этот topology-узел.
 * Дочерние Wimp под этим topology лежат в `actor` table — читать через
 * `boundary.actor.<...>` параллельно.
 */
export class TopologyChildren {
  constructor(
    private readonly sql: SQL,
    private readonly parentId: number,
  ) {}

  async all(): Promise<AnyTopology[]> {
    const rows = await this.sql<Array<Record<string, unknown>>>`
      SELECT id, parent_actor, parent_topology, kind, position
      FROM topology
      WHERE parent_topology = ${this.parentId}
      ORDER BY position
    `
    return rows.map((row) => buildTopology(this.sql, decodeTopologyRow(row)))
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{count: number}>>`
        SELECT COUNT(*) AS count FROM topology WHERE parent_topology = ${this.parentId}
      `
    )[0]
    return row?.count ?? 0
  }
}

abstract class TopologyBase {
  abstract readonly kind: TopologyKind
  readonly children: TopologyChildren

  constructor(
    protected readonly sql: SQL,
    readonly id: number,
  ) {
    this.children = new TopologyChildren(sql, id)
  }

  async position(): Promise<number> {
    const row = (
      await this.sql<Array<{position: number}>>`
        SELECT position FROM topology WHERE id = ${this.id} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`topology ${this.id} not found`)
    return Number(row.position)
  }

  async parentRef(): Promise<{kind: "actor"; id: number} | {kind: "topology"; id: number} | null> {
    const row = (
      await this.sql<Array<{parent_actor: number | null; parent_topology: number | null}>>`
        SELECT parent_actor, parent_topology FROM topology WHERE id = ${this.id} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`topology ${this.id} not found`)
    if (row.parent_actor !== null && row.parent_actor !== undefined) {
      return {kind: "actor", id: Number(row.parent_actor)}
    }
    if (row.parent_topology !== null && row.parent_topology !== undefined) {
      return {kind: "topology", id: Number(row.parent_topology)}
    }
    return null
  }
}

export class Fuzzy extends TopologyBase {
  readonly kind = "fuzzy" as const

  /**
   * Возвращает выбранную ветвь Fuzzy либо `null`, если ветвь ещё не зафиксирована.
   * Каждый из вариантов discriminated union: ветка может быть actor (Wimp) или другая topology.
   */
  async selected(): Promise<{kind: "actor"; id: number} | {kind: "topology"; id: number} | null> {
    const row = (
      await this.sql<Array<{selected_actor: number | null; selected_topology: number | null}>>`
        SELECT selected_actor, selected_topology
        FROM topology_fuzzy_state
        WHERE topology = ${this.id}
        LIMIT 1
      `
    )[0]
    if (!row) return null
    if (row.selected_actor !== null && row.selected_actor !== undefined) {
      return {kind: "actor", id: Number(row.selected_actor)}
    }
    if (row.selected_topology !== null && row.selected_topology !== undefined) {
      return {kind: "topology", id: Number(row.selected_topology)}
    }
    return null
  }
}

export class Axion extends TopologyBase {
  readonly kind = "axion" as const
}

export class Macho extends TopologyBase {
  readonly kind = "macho" as const
}

export type AnyTopology = Fuzzy | Axion | Macho

export const buildTopology = (sql: SQL, row: TopologyRecord): AnyTopology => {
  switch (row.kind) {
    case "fuzzy":
      return new Fuzzy(sql, row.id)
    case "axion":
      return new Axion(sql, row.id)
    case "macho":
      return new Macho(sql, row.id)
  }
}
