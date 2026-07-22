import type {Particle} from "shared/protocol/force/particle"

/** Stable canonical enum identity; itemValue is resolved from the current Variant declaration. */
export type BoundaryInitialVariantRef = {kind: "enum"; variant: number}

/** One normalized Boundary declaration required to prepare a domain Store. */
export type BoundaryInitialDeclaration = {
  src: string
  section: "fields" | "variants" | "states" | "transitions" | "conditions" | "processes"
  localId: string
  value: Record<string, unknown>
}

/** Canonical materialized Atom data, before any Matrix-specific packing. */
export type BoundaryInitialAtom = {
  id: number
  wimp: string
  values: Array<{
    field: number
    /** Canonical Boundary value identity. Equal IDs are an explicit shared Field relation. */
    valueId: number
    /** Enum values use BoundaryInitialVariantRef; other Fields carry their scalar/list payload. */
    value: unknown
  }>
  state: number | null
}

/** Canonical current Boundary data used by Matrix during server birth. */
export type BoundaryInitialState = {
  version: 1
  atoms: BoundaryInitialAtom[]
  declarations: BoundaryInitialDeclaration[]
}

export const BOUNDARY_INITIAL_STATE_METHOD = "boundary.initialState.read" as const

/** One current canonical projection entry carried by RPC, not by Force. */
export type BoundaryInitialProjectionEntry = Omit<Particle, "by" | "ts">

/** Complete current Boundary projection used to prepare a domain Store. */
export type BoundaryInitialProjection = {
  version: 1
  entries: BoundaryInitialProjectionEntry[]
}

export const BOUNDARY_INITIAL_PROJECTION_METHOD = "boundary.initialProjection.read" as const
