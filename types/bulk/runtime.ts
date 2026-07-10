import type { MatterParticleKind } from "../metafor/matter.ts"
import type { ActorRecord } from "../boundary/actor.ts"
import type { ActorValueRecord, FieldEnumVariantRecord, ValueItemRecord } from "../boundary/value.ts"
import type { TopologyRecord } from "../boundary/topology.ts"

export interface BulkRuntimeMatterParticle {
  id: number
  wimp: string
  parentParticle: number | null
  particleKind: MatterParticleKind
  edgeSlot: "root" | "child" | "then" | "else" | "branch"
  particleOrder: number
}

export interface BulkRuntimeWimp {
  src: string
  name: string | null
}

export interface BulkRuntimeField {
  id: number
  wimp: string
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
  label: string | null
}

export interface BulkRuntimeValue {
  id: number
  kind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  booleanValue: number | null
  numberValue: number | null
  textValue: string | null
  enumValue: string | null
}

export interface BulkRuntimeMatterBindingPath {
  wimp: string
  particle: number
  depOrder: number
  path: string
}

export interface BulkRuntimeMatterChildBindingPath extends BulkRuntimeMatterBindingPath {
  childOrder: number
}

/** Local Bulk projection assembled incrementally from ordinary particles. */
export interface BulkRuntimeProjection {
  actors: ActorRecord[]
  topologies: TopologyRecord[]
  wimps: BulkRuntimeWimp[]
  fields: BulkRuntimeField[]
  fieldEnumVariants: FieldEnumVariantRecord[]
  actorValues: ActorValueRecord[]
  values: BulkRuntimeValue[]
  valueItems: ValueItemRecord[]
  matterParticles: BulkRuntimeMatterParticle[]
  matterTopologyBindingPaths: BulkRuntimeMatterBindingPath[]
  matterChildWimpBindingPaths: BulkRuntimeMatterChildBindingPath[]
}
