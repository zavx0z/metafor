/**
 * Типы для реакций
 * @packageDocumentation
 * @module Reactions
 */

import type { Schema, Update, Values } from "@zavx0z/context"
import type { Core, JsonPatch } from "./index.t"
import type { ReactionUpdate } from "../schema/reactions.t"

export type ReactionParams = {
  meta: string
  actor: string
  timestamp: number
  patch: JsonPatch
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
  }) => void
  hasReactions: () => boolean
  getAllReactions: () => Array<{
    title: string
    description?: string
    update: ReactionUpdate<C, S, I>
    filter: (params: ReactionParams) => boolean
  }>
  getReactions: (state: S) => Array<{
    title: string
    description?: string
    update: ReactionUpdate<C, S, I>
    filter: (params: ReactionParams) => boolean
  }>
}
