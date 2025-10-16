/**
 * Типы для реакций
 * @packageDocumentation
 * @module Reactions
 */

import type { Schema, Values } from "@zavx0z/context"
import type { JsonPatch } from "./force/electromagnetic.t"
import type { Core } from "./force/gravity.t"
import type { ReactionAction } from "../meta/reactions.t"
import type { Self, SelfInfo } from "../meta/metafor.t"
import type { Week } from "./force/week"

export type ReactionParams = {
  meta: string
  actor: string
  timestamp: number
  patch: JsonPatch
  self: Self
}

export type Reactions<C extends Schema = Schema, S extends string = string, I extends Core = Core> = {
  run: (params: {
    state: S
    context: Values<C>
    core: I
    meta: string
    actor: string
    timestamp: number
    patch: JsonPatch
    update: Week['update']
    self: Self
  }) => void
  hasReactions: () => boolean
  getAllReactions: () => Array<{
    label: string
    desc?: string
    update: ReactionAction<C, S, I>
    getConditions: (params: { self: SelfInfo; context: Values<C> }) => any
  }>
  getReactions: (state: S) => Array<{
    label: string
    desc?: string
    update: ReactionAction<C, S, I>
    getConditions: (params: { self: SelfInfo; context: Values<C> }) => any
  }>
}
