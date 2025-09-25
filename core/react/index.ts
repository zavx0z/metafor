/**
 * Реализация реакций
 * @module Reactions
 */
import type { Schema, Update, Values } from "@zavx0z/context"
import type { ActorInfo, Core, JsonPatch } from "../index.t"
import type { ReactionUpdate, SnapshotReactions, ReactionParams } from "./index.t"
import { createFilterFn } from "./condition"

/**
 * Десериализует реакции из snapshot и возвращает объект с функциями для работы с реакциями.
 *
 * @param snapshot - сериализованный снимок реакций
 * @returns объект с функциями для работы с реакциями
 *
 * @example
 * ```ts
 * const reactions = deserializeReactions(snapshot)
 * if (reactions.hasReactions()) {
 *   reactions.run({
 *     context,
 *     core,
 *     meta: message.meta,
 *     actor: message.actor,
 *     timestamp: message.timestamp,
 *     patch,
 *     state,
 *     update
 *   })
 * }
 * ```
 */
export function deserializeReactions<C extends Schema, S extends string, I extends Core = {}>(
  snapshot: SnapshotReactions
): {
  run: (params: {
    state: S
    context: Values<C>
    core: I
    meta: string
    actor: ActorInfo
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
} {
  const reactions: Array<{
    title: string
    description?: string
    update: ReactionUpdate<C, S, I>
    filter: (params: ReactionParams) => boolean
    states: string[]
  }> = []

  const stateToReactions: Record<string, string[]> = {}

  // Восстанавливаем реакции из snapshot
  for (const [reactionId, reactionData] of Object.entries(snapshot.reactions)) {
    if (reactionData && typeof reactionData === "object") {
      // Восстанавливаем функцию equal из строки
      const updateFn = new Function("return " + reactionData.src)() as ReactionUpdate<C, S, I>

      // Создаем функцию фильтра на основе условий
      const filterFn = createFilterFn(reactionData.cond)

      const reaction = {
        title: reactionData.title,
        ...(reactionData.desc && { description: reactionData.desc }),
        update: updateFn,
        filter: filterFn,
        states: [] as string[],
      }

      reactions.push(reaction)

      // Связываем реакции с состояниями
      for (const [state, reactionIds] of Object.entries(snapshot.states)) {
        if (reactionIds.includes(reactionId)) {
          reaction.states.push(state)
          if (!stateToReactions[state]) stateToReactions[state] = []
          stateToReactions[state].push(reactionId)
        }
      }
    }
  }

  return {
    run: (params) => {
      for (const reaction of reactions) {
        // Проверяем, что реакция активна для текущего состояния
        if (!reaction.states.includes(params.state)) continue

        // Проверяем фильтр
        if (
          reaction.filter({
            meta: params.meta,
            actor: params.actor,
            timestamp: params.timestamp,
            patch: params.patch,
          })
        ) {
          // Выполняем реакцию
          reaction.update({
            update: params.update,
            context: params.context,
            core: params.core,
            meta: params.meta,
            actor: params.actor,
            timestamp: params.timestamp,
            patch: params.patch,
            state: params.state,
          })
        }
      }
    },
    hasReactions: () => reactions.length > 0,
    getAllReactions: () => reactions.map(({ states, ...reaction }) => reaction),
    getReactions: (state: S) => {
      return reactions
        .filter((reaction) => reaction.states.includes(state as string))
        .map(({ states, ...reaction }) => reaction)
    },
  }
}
