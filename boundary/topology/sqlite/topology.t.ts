export type TopologyKind = "fuzzy" | "axion" | "macho"

export interface TopologyRecord {
  id: number
  parentActor: number | null
  parentTopology: number | null
  kind: TopologyKind
  position: number
}

/**
 * Вход для `TopologyApi.create`. Без `position` — он вычисляется автоматически
 * как next среди siblings (по `parent_actor`/`parent_topology`).
 */
export interface TopologyInput {
  id?: number | undefined
  parentActor: number | null
  parentTopology: number | null
  kind: TopologyKind
}

export interface TopologyFuzzyStateRecord {
  topology: number
  selectedActor: number | null
  selectedTopology: number | null
}
