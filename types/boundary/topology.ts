export type TopologyKind = "fuzzy" | "axion" | "macho"

export interface TopologyRecord {
  id: number
  parentActor: number | null
  parentTopology: number | null
  kind: TopologyKind
  position: number
}

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
