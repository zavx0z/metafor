import type { NodeCondition, NodeLogical, NodeMap, NodeMeta } from "@metafor/template"
import type { MetaDSL } from "./metafor.t"

export type LocalTopologyObjectKind = "wimp" | "fuzzy" | "macho"

export type LocalTopologyPlacementRelation = "root" | "contains" | "true" | "false" | "branch" | "expands"

export interface LocalTopologyPlacement {
  id: string
  objectId: string
  address: string
  parentId?: string
  relation: LocalTopologyPlacementRelation
  branchValue?: string | number
}

export interface LocalTopologyLink {
  from: string
  to: string
  relation: Exclude<LocalTopologyPlacementRelation, "root">
}

export interface LocalTopologyReference {
  id: string
  objectId: string
  placementId: string
  tag: string
  src: string
  via: "static" | "enum"
  field?: string
  value?: string | number
}

export interface LocalTopologyEntanglementSeed {
  placementId: string
  objectId: string
  kind: LocalTopologyObjectKind
  address: string
  dataPaths: string[]
  referenceIds: string[]
}

interface LocalTopologyObjectBase {
  id: string
  kind: LocalTopologyObjectKind
  nodePath: string
}

export interface LocalTopologyWIMP extends LocalTopologyObjectBase {
  kind: "wimp"
  sourceNode: NodeMeta
  tag: string
  src?: string
  srcMode: "none" | "static" | "enum"
  variant?: {
    field: string
    value: string | number
  }
}

export interface LocalTopologyFuzzy extends LocalTopologyObjectBase {
  kind: "fuzzy"
  sourceNode: NodeLogical | NodeCondition | NodeMeta
  selector:
    | {
        kind: "logical"
        dataPaths: string[]
        expr?: string
      }
    | {
        kind: "condition"
        dataPaths: string[]
        expr?: string
      }
    | {
        kind: "enum"
        dataPath: string
        field: string
        values: Array<string | number>
        expr?: string
      }
}

export interface LocalTopologyMACHO extends LocalTopologyObjectBase {
  kind: "macho"
  sourceNode: NodeMap
  dataPath: string
}

export type LocalTopologyObject = LocalTopologyWIMP | LocalTopologyFuzzy | LocalTopologyMACHO

export interface LocalTopologyFragment {
  meta: string
  objects: Record<string, LocalTopologyObject>
  roots: string[]
  placements: Record<string, LocalTopologyPlacement>
  links: LocalTopologyLink[]
  references: LocalTopologyReference[]
  entanglementSeeds: LocalTopologyEntanglementSeed[]
}

export type LocalTopologyMetaLike = Pick<MetaDSL, "name" | "fields" | "gravity">
