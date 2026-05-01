export type TopologyKind = "fuzzy" | "axion" | "macho"

export interface TopologyRecord {
  uuid: string
  parentActor: string | null
  parentTopology: string | null
  kind: TopologyKind
  position: number
}

export interface TopologyFuzzyStateRecord {
  topology: string
  selectedActor: string | null
  selectedTopology: string | null
}
