import type {ParsedFinally} from "@metafor/types/metafor/finally"
import type {MetaDSL, MetaFieldDSL, MetaReactionDSL, MetaSuperpositionDSL} from "@metafor/types/metafor/metafor"
import type {MatterEdgeSlot, MatterParticle, MatterParticleKind} from "./matter.ts"
import type {ParsedProcess} from "@metafor/types/metafor/process"

export interface ActorRecord {
  id: number
  parentActor: number | null
  parentTopology: number | null
  wimp: string
  position: number
}

export interface ActorInputRow {
  id?: number | undefined
  parentActor: number | null
  parentTopology: number | null
  wimp: string
}

export interface ActorRows {
  actor: ActorInputRow
  values: ActorValueRecord[]
  valueRecords: ValueRecord[]
  valueItems: ValueItemRecord[]
  state: ActorStateRecord
}

export interface ActorValueRecord {
  actor: number
  field: number
  value: number
}

export interface FieldEnumVariantRecord {
  id: number
  field: number
  position: number
  itemValue: string
}

export interface ActorStateRecord {
  actor: number
  metaState: number | null
}

export type ScalarKind = "null" | "boolean" | "number" | "string" | "enum"

export type ValueKind = ScalarKind | "list"

export type Scalar =
  | { kind: "null" }
  | { kind: "boolean"; boolean: boolean }
  | { kind: "number"; number: number }
  | { kind: "string"; text: string }
  | { kind: "enum"; variant: number }

export type ValueRecord =
  | { id: number; kind: "null" }
  | { id: number; kind: "boolean"; boolean: boolean }
  | { id: number; kind: "number"; number: number }
  | { id: number; kind: "string"; text: string }
  | { id: number; kind: "enum"; variant: number }
  | { id: number; kind: "list" }

export interface ValueItemRecord {
  value: number
  position: number
  itemValue: string
}

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

export interface WimpCreateProcessInput {
  key: string
  declaration: ParsedProcess | ParsedFinally
}

export interface WimpCreateInput {
  name?: string | null | undefined
  desc?: string | null | undefined
  bulk?: MetaDSL["bulk"] | null | undefined
  mass?: MetaDSL["mass"]
  fields?: readonly MetaFieldDSL[] | undefined
  superposition?: readonly MetaSuperpositionDSL[] | undefined
  processes?: readonly WimpCreateProcessInput[] | undefined
  reactions?: readonly MetaReactionDSL[] | undefined
  matter?: readonly MatterParticle[] | undefined
}

export interface WimpMassValueRow {
  id: number
  parent_value: number | null
  value_kind: "object" | "array" | "string" | "number" | "boolean" | "null"
  entry_key: string | null
  entry_order: number | null
  text_value: string | null
  number_value: number | null
  boolean_value: number | null
}

export interface MatterBindingRow {
  id: number
  binding_kind: "static" | "variable" | "dynamic"
  literal_kind: "text" | "boolean" | null
  literal_text: string | null
  literal_boolean: number | null
  expr: string | null
}

export interface MatterParticleRow {
  id: number
  parent_particle: number | null
  particle_kind: MatterParticleKind
  edge_slot: MatterEdgeSlot
  particle_order: number
}

export interface WimpParticleRow {
  particle: number
  src: string
  fields_binding: number | null
  mass_binding: number | null
}

export interface FuzzyParticleRow {
  particle: number
  fuzzy_kind: "dynamic-meta" | "cond"
  predicate_binding: number | null
}

export interface AxionParticleRow {
  particle: number
  predicate_binding: number
}

export interface MachoParticleRow {
  particle: number
  collection_binding: number
}

export interface WimpReactionRow {
  id: number
  key: string
  label: string
  desc: string | null
  cond_source: string
  update_source: string
}
