/**
 * Типы для реакций
 * @packageDocumentation
 * @module Reactions
 */

import type { ActorInfo, Core, JsonPatch } from "./index.t"

export type ReactionParams = {
  meta: string
  actor: ActorInfo
  timestamp: number
  patch: JsonPatch
}
