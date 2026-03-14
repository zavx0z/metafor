import type { NodeCondition, NodeLogical, NodeMap, NodeMeta } from "@metafor/template"
import type { MetaDSL } from "./metafor.t"

/**
 * Виды topology-объектов в локальном фрагменте.
 *
 * - `wimp` — скрытый meta-узел (NodeMeta), точка привязки topology
 * - `axion` — логический узел (NodeLogical), не является выбором ветви
 * - `fuzzy` — узел выбора ветви (NodeCondition), только state/enum
 * - `macho` — узел множественности (NodeMap), array-based разворачивание
 */
export type LocalTopologyObjectKind = "wimp" | "axion" | "fuzzy" | "macho"

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

/**
 * Axion — логический узел topology на основе NodeLogical.
 *
 * Не является выбором ветви (fuzzy), а выражает логическую группировку.
 * Не участвует в branch selection и не создаёт альтернативных миров.
 */
export interface LocalTopologyAxion extends LocalTopologyObjectBase {
  kind: "axion"
  sourceNode: NodeLogical
  dataPaths: string[]
  expr?: string
}

/**
 * Fuzzy — узел выбора ветви на основе NodeCondition.
 *
 * **Важно:** branch-choice basis ограничен двумя вариантами:
 * - `state` — выбор по значению state
 * - `enum` — выбор по enum topology-field
 *
 * NodeLogical больше не компилируется в fuzzy.
 */
export interface LocalTopologyFuzzy extends LocalTopologyObjectBase {
  kind: "fuzzy"
  sourceNode: NodeCondition | NodeMeta
  selector:
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

/**
 * Union всех видов topology-объектов.
 */
export type LocalTopologyObject = LocalTopologyWIMP | LocalTopologyAxion | LocalTopologyFuzzy | LocalTopologyMACHO

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
