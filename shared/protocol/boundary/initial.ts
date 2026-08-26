import type {Particle} from "shared/protocol/force/particle"
import type {ProcessExecutionId} from "shared/protocol/force/execution"
import type {ReactionQueueCommit, ReactionRelation} from "shared/protocol/force/reaction"

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

/** Unfinished execution from the previous full contour, never a live Energy handle. */
export type BoundaryInitialPendingProcessExecution = {
  executionId: ProcessExecutionId
  atom: number
  process: number
  state: string
}

/**
One durable Reaction queue entry that was unfinished at the initial SQL cut.

`energy` is non-null after an old Energy claim. Matrix passes that distinction
back to Boundary recovery instead of guessing whether the old action wrote Mass.
*/
export type BoundaryInitialReactionExecution = {
  queue: ReactionQueueCommit
  energy: string | null
}

/** Canonical current Boundary data used by Matrix during server birth. */
export type BoundaryInitialState = {
  version: 3
  atoms: BoundaryInitialAtom[]
  declarations: BoundaryInitialDeclaration[]
  pendingProcessExecutions: BoundaryInitialPendingProcessExecution[]
  /** Complete exact potential relations resolved by Boundary at this same cut. */
  reactionRelations: ReactionRelation[]
  /** Durable per-target FIFO entries, ordered by target and queue order. */
  unfinishedReactionExecutions: BoundaryInitialReactionExecution[]
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
