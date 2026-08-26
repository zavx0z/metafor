/**
Reaction declaration for observing confirmed State changes of other Atom.

Boundary resolves authored selectors into exact runtime relations. Matrix
activates those relations only while the target Atom is in an authored State,
and Energy executes the Reaction beside the target Atom Mass. Reaction never
receives live Energy objects and cannot write topology Fields.

@packageDocumentation
*/

import type {Fields, Values} from "./fields.ts"
import type {Mass, Self} from "./schema.ts"

export type ReactionSourceRelation = "parent" | "child" | "descendant"

/**
One conjunctive source selector resolved by Boundary.

Present `atom`, `meta` and `relation` constraints must all match. Selectors in
one Reaction are alternatives; matching several selectors still creates one
exact source-to-target relation. The target Atom itself never matches.
*/
export type ReactionSourceSelector = Readonly<{
  /** Exact runtime Atom reference in the public `atom:<id>` form. */
  atom?: `atom:${string}`
  /** WIMP address shared by every matching runtime Atom. */
  meta?: string
  /** Structural position of the source relative to the target Atom. */
  relation?: ReactionSourceRelation
  /** New source States observed by this selector. */
  states: readonly [string, ...string[]]
}>

/**
Exact target Mass dependencies visible in Graph and enforced by Energy.

Read access exposes only read methods and write access exposes only `write`.
Mass writes are immediate and are not rolled back with a later Field proposal.
*/
export type ReactionMassAccess<m extends Mass> = Readonly<{
  read?: readonly Extract<keyof m, string>[]
  write?: readonly Extract<keyof m, string>[]
}>

/** Stable declaration identity, presentation metadata and explicit Mass access. */
export type ReactionConfig<m extends Mass> = Readonly<{
  key: string
  label?: string
  desc?: string
  mass?: ReactionMassAccess<m>
}>

/**
One Boundary-confirmed source State occurrence.

`id` is the stable causal event identity. The previous State and arbitrary
Force Particle are intentionally absent.
*/
export type ReactionObservation = Readonly<{
  id: string
  source: Readonly<{
    atom: `atom:${string}`
    meta: string
    state: string
  }>
  timestamp: number
}>

type OrdinaryFieldKey<ɸ extends Fields> = {
  [Key in keyof ɸ]: ɸ[Key]["type"] extends "string" | "number" | "boolean" ? Key : never
}[keyof ɸ]

export type ReactionUpdate<ɸ extends Fields> = (
  /** Partial proposal for declared ordinary target Fields. */
  values: Partial<Pick<Values<ɸ>, OrdinaryFieldKey<ɸ>>>,
) => Partial<Pick<Values<ɸ>, OrdinaryFieldKey<ɸ>>>

/**
Runtime function of one queued Reaction execution.

The action receives only its target Atom snapshot and declared Mass projection.
It has no live Energy access and no error handler. A normal thrown error produces
a failed execution; a missing declared Field or Mass is a fatal system invariant
failure.
*/
export type ReactionAction<ɸ extends Fields, 𝛺 extends string, m extends Mass> = (args: Readonly<{
  /** Confirmed new State of the exact source Atom. */
  observation: ReactionObservation
  /** Collects a proposal for declared ordinary Fields of the target Atom. */
  update: ReactionUpdate<ɸ>
  /** Snapshot of exactly the declared target Field reads. */
  value: Values<ɸ>
  /** Capability-limited handles for explicitly declared target Mass keys. */
  mass: m
  /** Target State at Boundary registration time. */
  state: 𝛺
  /** Identity of the target Atom that owns the Reaction. */
  self: Self
}>) => void | Promise<void>

export type Reaction<ɸ extends Fields, 𝛺 extends string, m extends Mass> = Readonly<{
  key: string
  label: string
  desc?: string
  sources: readonly ReactionSourceSelector[]
  update: ReactionAction<ɸ, 𝛺, m>
}>

export type ReactionBuilder<ɸ extends Fields, 𝛺 extends string, m extends Mass> = (
  config: ReactionConfig<m>,
) => {
  /** Declares one or more structural/source-State alternatives. */
  filter(sources: readonly [ReactionSourceSelector, ...ReactionSourceSelector[]]): {
    /** Attaches the action executed once for every queued confirmed State. */
    equal(update: ReactionAction<ɸ, 𝛺, m>): Reaction<ɸ, 𝛺, m> & {
      registerStates(states: 𝛺[]): void
    }
  }
}

export type ReactionsChainResult<ɸ extends Fields, 𝛺 extends string, m extends Mass> = readonly (
  readonly [readonly [𝛺, ...𝛺[]], Reaction<ɸ, 𝛺, m> & {registerStates(states: 𝛺[]): void}]
)[]

export type ReactionsDeclaration<ɸ extends Fields, 𝛺 extends string, m extends Mass> = (
  reaction: ReactionBuilder<ɸ, 𝛺, m>,
) => ReactionsChainResult<ɸ, 𝛺, m>

/** Serializable builder output before WIMP materialization. */
export interface ReactionsSchema {
  reactions: Record<string, {
    label: string
    desc?: string
    sources: ReactionSourceSelector[]
    read: string[]
    write: string[]
    massRead: string[]
    massWrite: string[]
    src: string
  }>
  superposition: Record<string, string[]>
}
