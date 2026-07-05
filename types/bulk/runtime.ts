import type { MatterParticleKind } from "../metafor/matter.ts"
import type { ActorRecord } from "../boundary/actor.ts"
import type { ActorValueRecord, FieldEnumVariantRecord, ValueItemRecord } from "../boundary/value.ts"
import type { TopologyRecord } from "../boundary/topology.ts"
import type { Particle } from "../force/particle.ts"
import type { BulkLayoutSettings } from "./layout.ts"

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

export interface BulkRuntimeSnapshot {
  version: 1
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

export type ActorSnapshotMessage = {
  actor: ActorRecord
  values: ActorValueRecord[]
  valueRecords: Array<{
    id: number
    kind: BulkRuntimeValue["kind"]
    boolean?: boolean
    number?: number
    text?: string
    variant?: number
  }>
  valueItems: ValueItemRecord[]
}

export type ForceSnapshotEffect = "none" | "partial" | "rebuild"

export type ForceSocketMessage = {
  type: "force"
  parts: Particle[]
}

export type SnapshotMessage = {
  type: "snapshot"
  src: string
  snapshot: BulkRuntimeSnapshot
}

export type BulkErrorMessage = {
  type: "error"
  error: string
}

export type ClientMaterializePayload = {
  type: "materialize"
  src: string
  layoutSettings: Partial<BulkLayoutSettings>
}
