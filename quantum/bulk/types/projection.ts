import type { MatterBindingValue, MatterParticleKind } from "../metafor/matter.ts"
import type { AtomRecord } from "../boundary/atom.ts"
import type { AtomValueRecord, FieldEnumVariantRecord, ValueItemRecord } from "../boundary/value.ts"
import type { TopologyRecord } from "../boundary/topology.ts"

export interface BulkRuntimeMatterParticle {
  id: number
  wimp: string
  parentParticle: number | null
  particleKind: MatterParticleKind
  edgeSlot: "root" | "child" | "then" | "else" | "branch"
  particleOrder: number
  predicateBinding?: {
    data: string | string[]
    expr?: string
  }
  fieldsBinding?: {
    data: string | string[]
    expr?: string
  }
  targetSrc?: string
  massBinding?: MatterBindingValue
  energyBinding?: MatterBindingValue
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

export interface BulkRuntimeState {
  id: number
  wimp: string
  name: string
  position: number
}

export interface BulkRuntimeTransition {
  id: number
  wimp: string
  fromState: number
  toState: number
  position: number
}

export interface BulkRuntimeCondition {
  id: number
  wimp: string
  transition: number
  field: number
  position: number
  predicate: unknown
}

export interface BulkRuntimeProcess {
  id: number
  wimp: string
  state: string
  descriptor: {
    type: "action" | "finally"
    key: string
    label?: string | null
    desc?: string | null
    [key: string]: unknown
  }
}

export interface BulkRuntimeReaction {
  id: number
  wimp: string
  key: string
  label?: string | null
  desc?: string | null
  read: number[]
  write: number[]
  states: number[]
}

export interface BulkRuntimeAtomState {
  atom: number
  state: number | null
}

/** The exact semantic facet touched by one accepted Bulk projection update. */
export type BulkProjectionFacet =
  | "current-state"
  | "field-value"
  | "none"
  | "structure"

/** Addressable result of applying one Particle to the persistent projection. */
export type BulkProjectionChange = Readonly<{
  changed: boolean
  affectedAtomIds: number[]
  facet: BulkProjectionFacet
  structural: boolean
}>

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

/**
 * Bulk-local semantic projection derived from a validated Graph cut.
 * Numeric keys belong only to this adapter/render model and are never public
 * Boundary identities. Legacy fixture lifecycles may still apply Particles to
 * an already recorded projection without changing this production source law.
 */
export interface BulkRuntimeProjection {
  atoms: AtomRecord[]
  topologies: TopologyRecord[]
  wimps: BulkRuntimeWimp[]
  fields: BulkRuntimeField[]
  states: BulkRuntimeState[]
  transitions: BulkRuntimeTransition[]
  conditions: BulkRuntimeCondition[]
  processes: BulkRuntimeProcess[]
  reactions: BulkRuntimeReaction[]
  atomStates: BulkRuntimeAtomState[]
  fieldEnumVariants: FieldEnumVariantRecord[]
  atomValues: AtomValueRecord[]
  values: BulkRuntimeValue[]
  valueItems: ValueItemRecord[]
  matterParticles: BulkRuntimeMatterParticle[]
  matterTopologyBindingPaths: BulkRuntimeMatterBindingPath[]
  matterChildWimpBindingPaths: BulkRuntimeMatterChildBindingPath[]
}
