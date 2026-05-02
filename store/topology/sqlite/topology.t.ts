export type TopologyKind = "fuzzy" | "axion" | "macho"

export interface TopologyRecord {
  uuid: string
  parentActor: string | null
  parentTopology: string | null
  kind: TopologyKind
  position: number
}

/**
 * Вход для `TopologyApi.create`. Без `position` — он вычисляется автоматически
 * как next среди siblings (по `parent_actor`/`parent_topology`).
 */
export interface TopologyInput {
  uuid: string
  parentActor: string | null
  parentTopology: string | null
  kind: TopologyKind
}

export interface TopologyFuzzyStateRecord {
  topology: string
  selectedActor: string | null
  selectedTopology: string | null
}
