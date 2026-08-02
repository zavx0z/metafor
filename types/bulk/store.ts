/** Numeric arrays are JSON arrays on the wire and typed buffers in the browser. */
export type BulkStoreNumericArray =
  | number[]
  | Uint8Array
  | Uint32Array
  | Int32Array
  | Float32Array

export type BulkStoreShapeColumns = {
  id: BulkStoreNumericArray
  kind: BulkStoreNumericArray
  flags: BulkStoreNumericArray
  label: BulkStoreNumericArray
  position: BulkStoreNumericArray
  form: BulkStoreNumericArray
  material: BulkStoreNumericArray
}

export type BulkStoreDarkColumns = BulkStoreShapeColumns & {
  parent: BulkStoreNumericArray
  /** Dictionary reference to canonical WIMP.src for Atom rows; zero for Topology rows. */
  wimp: BulkStoreNumericArray
  /** Stable sibling placement order from the structural projection. */
  order: BulkStoreNumericArray
}

/** Canonical WIMP identity is stored once; row slots are compression, not domain IDs. */
export type BulkStoreWimpColumns = {
  src: string[]
  name: BulkStoreNumericArray
  flags: BulkStoreNumericArray
}

/** Canonical Boundary Field rows; display text is interned once per declaration. */
export type BulkStoreFieldSourceColumns = {
  id: BulkStoreNumericArray
  wimp: BulkStoreNumericArray
  /** Boundary field.local_id; stable placement order inside one WIMP. */
  localId: BulkStoreNumericArray
  kind: BulkStoreNumericArray
  key: BulkStoreNumericArray
  label: BulkStoreNumericArray
  flags: BulkStoreNumericArray
}

/** Minimal canonical Boundary State rows needed for local structural layout. */
export type BulkStoreStateSourceColumns = {
  id: BulkStoreNumericArray
  wimp: BulkStoreNumericArray
  position: BulkStoreNumericArray
  name: BulkStoreNumericArray
  flags: BulkStoreNumericArray
}

/** Minimal canonical Boundary Transition rows; from/to are persisted State ids. */
export type BulkStoreTransitionSourceColumns = {
  id: BulkStoreNumericArray
  wimp: BulkStoreNumericArray
  fromState: BulkStoreNumericArray
  toState: BulkStoreNumericArray
  position: BulkStoreNumericArray
  flags: BulkStoreNumericArray
}

/** Predicate data is not visual; identity and relational incidence are sufficient. */
export type BulkStoreConditionSourceColumns = {
  id: BulkStoreNumericArray
  wimp: BulkStoreNumericArray
  transition: BulkStoreNumericArray
  field: BulkStoreNumericArray
  position: BulkStoreNumericArray
  flags: BulkStoreNumericArray
}

/** Minimal Process row plus slices into processField (read slice followed by write slice). */
export type BulkStoreProcessSourceColumns = {
  id: BulkStoreNumericArray
  wimp: BulkStoreNumericArray
  state: BulkStoreNumericArray
  kind: BulkStoreNumericArray
  label: BulkStoreNumericArray
  readStart: BulkStoreNumericArray
  readCount: BulkStoreNumericArray
  writeStart: BulkStoreNumericArray
  writeCount: BulkStoreNumericArray
  flags: BulkStoreNumericArray
}

/** Minimal Reaction row plus numeric Field and State incidence slices. */
export type BulkStoreReactionSourceColumns = {
  id: BulkStoreNumericArray
  wimp: BulkStoreNumericArray
  label: BulkStoreNumericArray
  readStart: BulkStoreNumericArray
  readCount: BulkStoreNumericArray
  writeStart: BulkStoreNumericArray
  writeCount: BulkStoreNumericArray
  stateStart: BulkStoreNumericArray
  stateCount: BulkStoreNumericArray
  allStates: BulkStoreNumericArray
  flags: BulkStoreNumericArray
}

export type BulkStoreFieldColumns = BulkStoreShapeColumns & {
  owner: BulkStoreNumericArray
  field: BulkStoreNumericArray
  key: BulkStoreNumericArray
  value: BulkStoreNumericArray
  valueText: BulkStoreNumericArray
}

export type BulkStoreFieldAliasColumns = {
  id: BulkStoreNumericArray
  flags: BulkStoreNumericArray
  atom: BulkStoreNumericArray
  field: BulkStoreNumericArray
  value: BulkStoreNumericArray
  marker: BulkStoreNumericArray
  /** Stable source-occurrence order; independent from the current Value group. */
  order: BulkStoreNumericArray
  /** Compact centered-nested orbit cursor; updated in-place after regroup. */
  orbit: BulkStoreNumericArray
  valueText: BulkStoreNumericArray
}

export type BulkStoreOrbitalColumns = BulkStoreShapeColumns & {
  owner: BulkStoreNumericArray
  source: BulkStoreNumericArray
  anchor: BulkStoreNumericArray
  sleeve: BulkStoreNumericArray
  relatedStart: BulkStoreNumericArray
  relatedCount: BulkStoreNumericArray
}

export type BulkStoreProxyColumns = BulkStoreShapeColumns & {
  owner: BulkStoreNumericArray
  field: BulkStoreNumericArray
  sourceField: BulkStoreNumericArray
  state: BulkStoreNumericArray
  paint: BulkStoreNumericArray
}

export type BulkStoreTransitionColumns = {
  id: BulkStoreNumericArray
  source: BulkStoreNumericArray
  owner: BulkStoreNumericArray
  from: BulkStoreNumericArray
  to: BulkStoreNumericArray
  flags: BulkStoreNumericArray
  batch: BulkStoreNumericArray
  control: BulkStoreNumericArray
}

export type BulkStoreRelationColumns = {
  id: BulkStoreNumericArray
  owner: BulkStoreNumericArray
  kind: BulkStoreNumericArray
  flags: BulkStoreNumericArray
  aKind: BulkStoreNumericArray
  a: BulkStoreNumericArray
  bKind: BulkStoreNumericArray
  b: BulkStoreNumericArray
  batch: BulkStoreNumericArray
  controlStart: BulkStoreNumericArray
  control: BulkStoreNumericArray
}

export type BulkStoreBatchColumns = {
  id: BulkStoreNumericArray
  owner: BulkStoreNumericArray
  kind: BulkStoreNumericArray
  flags: BulkStoreNumericArray
  material: BulkStoreNumericArray
}

/**
 * One flat relational Bulk Store. It has no version, cursor, Graph address,
 * JSON Pointer, semantic manifest or renderer-ready scene envelope.
 */
export type BulkStore = {
  root: number
  text: string[]
  wimp: BulkStoreWimpColumns
  fieldSource: BulkStoreFieldSourceColumns
  stateSource: BulkStoreStateSourceColumns
  transitionSource: BulkStoreTransitionSourceColumns
  conditionSource: BulkStoreConditionSourceColumns
  processSource: BulkStoreProcessSourceColumns
  processField: BulkStoreNumericArray
  reactionSource: BulkStoreReactionSourceColumns
  reactionField: BulkStoreNumericArray
  reactionState: BulkStoreNumericArray
  dark: BulkStoreDarkColumns
  field: BulkStoreFieldColumns
  fieldAlias: BulkStoreFieldAliasColumns
  orbital: BulkStoreOrbitalColumns
  orbitalRelatedState: BulkStoreNumericArray
  proxy: BulkStoreProxyColumns
  transition: BulkStoreTransitionColumns
  relation: BulkStoreRelationColumns
  batch: BulkStoreBatchColumns
}

/** Dynamic page payload. The session is transport state, not part of Store. */
export type BulkStoreInitial = {
  session: string
  store: BulkStore
}

/** One existing Force message delivered after the initial Store cut. */
export type BulkStoreApplyControl = {
  control: "bulk.store.apply"
  message: ForceMessage
}

export const BULK_STORE_ENTITY_POSITION_STRIDE = 3
export const BULK_STORE_ENTITY_FORM_STRIDE = 2
export const BULK_STORE_QUANTUM_MATERIAL_STRIDE = 6
export const BULK_STORE_LINE_MATERIAL_STRIDE = 10
export const BULK_STORE_TRANSITION_CONTROL_STRIDE = 12
export const BULK_STORE_RELATION_CONTROL_STRIDE = 24

export const BULK_STORE_FLAG_CURRENT = 1
export const BULK_STORE_FLAG_ACTIVE = 2
export const BULK_STORE_FLAG_TORUS = 4
export const BULK_STORE_FLAG_RETURNING = 8
export const BULK_STORE_FLAG_OVERLAY = 16
export const BULK_STORE_FLAG_REMOVED = 32
import type {ForceMessage} from "shared/protocol/force/message"
