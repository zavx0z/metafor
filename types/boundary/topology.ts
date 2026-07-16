export type TopologyKind = "fuzzy" | "axion" | "macho"

export interface TopologyRecord {
  id: number
  parentAtom: number | null
  parentTopology: number | null
  kind: TopologyKind
  position: number
}

export interface TopologyInput {
  id?: number | undefined
  parentAtom: number | null
  parentTopology: number | null
  kind: TopologyKind
}

export interface TopologyFuzzyStateRecord {
  topology: number
  selectedAtom: number | null
  selectedTopology: number | null
}
