/**
 * Типы для реакций
 * @packageDocumentation
 * @module Reactions
 */

import type { Schema, Update, Values } from "@zavx0z/context"
import type { JsonPatch } from "../em.t"
import type { Mass } from "../gravity.t"
import type { ReactionAction } from "../../meta/reactions.t"
import type { Self } from "../../meta/metafor"

export type ReactionParams = {
  meta: string
  atom: string
  timestamp: number
  patch: JsonPatch
  self: Self
}

export type Reactions<ɸ extends Schema = Schema, 𝛴 extends string = string, m extends Mass = Mass> = {
  run: (params: {
    state: S
    fields: Values<ɸ>
    mass: M
    meta: string
    atom: string
    timestamp: number
    patch: JsonPatch
    update: Update<ɸ>
    self: Self
  }) => boolean
  exists: () => boolean
  getAll: () => Array<{
    label: string
    desc?: string
    update: ReactionAction<C, S, M>
    getConditions: (params: { self: Self; fields: Values<ɸ> }) => any
  }>
  get: (state: S) => Array<{
    label: string
    desc?: string
    update: ReactionAction<C, S, M>
    getConditions: (params: { self: Self; fields: Values<ɸ> }) => any
  }>
}
