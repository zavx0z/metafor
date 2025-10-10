/**
 * Типы для реакций
 * @packageDocumentation
 * @module Reactions
 */

import type { Schema, Update, Values } from "@zavx0z/context"
import type { Core, JsonPatch } from "../actor.t"
import type { ReactionUpdate } from "../schema/reactions.t"
import type { Self } from "../metafor.t"

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
    update: Update<C>
    self: Self
  }) => void
  hasReactions: () => boolean
  getAllReactions: () => Array<{
    label: string
    desc?: string
    update: ReactionUpdate<C, S, I>
    getConditions: (params: { self: Self }) => any
  }>
  getReactions: (state: S) => Array<{
    label: string
    desc?: string
    update: ReactionUpdate<C, S, I>
    getConditions: (params: { self: Self }) => any
  }>
}
