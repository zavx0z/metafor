/**
 * Типы для реакций
 * @packageDocumentation
 * @module Reactions
 */

import type { Schema, Update, Values } from "@zavx0z/context"
import type { JsonPatch } from "../em.t"
import type { Core } from "../gravity.t"
import type { ReactionAction } from "../../meta/reactions.t"
import type { Self } from "../../meta/metafor"

export type ReactionParams = {
  meta: string
  atom: string
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
    atom: string
    timestamp: number
    patch: JsonPatch
    update: Update<C>
    self: Self
  }) => void
  exists: () => boolean
  getAll: () => Array<{
    label: string
    desc?: string
    update: ReactionAction<C, S, I>
    getConditions: (params: { self: Self; context: Values<C> }) => any
  }>
  get: (state: S) => Array<{
    label: string
    desc?: string
    update: ReactionAction<C, S, I>
    getConditions: (params: { self: Self; context: Values<C> }) => any
  }>
}
