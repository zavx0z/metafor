/**
 * Реализация реакций
 * @module Reactions
 */
import type { Schema, Update, Values } from "@zavx0z/context"
import type { Core } from "../index.t"
import type { JsonPatch, ActorInfo } from "../message"
import type {
  ReactionsDeclaration,
  ReactionUpdate,
  Reaction,
  SnapshotReactions,
  ReactionMetadata,
  ReactionParams,
} from "./index.t"
import type { ReactionFilterConditions } from "./condition.t"
import { createFilterFn } from "./condition"
export type { ReactionsDeclaration }
/**
 * Анализирует функцию update для извлечения полей
 */
function extractFields<C extends Schema, S extends string, I extends Core>(update: ReactionUpdate<C, S, I>) {
  const updateStr = update.toString()
  const read: string[] = []
  const write: string[] = []

  // Извлекаем поля, которые читаются из контекста
  const contextMatches = updateStr.match(/context\.(\w+)/g)
  if (contextMatches) {
    for (const match of contextMatches) {
      const field = match.replace("context.", "")
      if (!read.includes(field)) {
        read.push(field)
      }
    }
  }

  // Извлекаем поля, которые записываются через update
  const updateMatches = updateStr.match(/update\(\s*\{\s*(\w+):/g)
  if (updateMatches) {
    for (const match of updateMatches) {
      const fieldMatch = match.match(/update\(\s*\{\s*(\w+):/)
      if (fieldMatch && fieldMatch[1]) {
        const field = fieldMatch[1]
        if (!write.includes(field)) {
          write.push(field)
        }
      }
    }
  }

  // Согласно тесту, если поле записывается, то оно также читается
  for (const writeField of write) {
    if (!read.includes(writeField)) {
      read.push(writeField)
    }
  }

  return { read, write }
}


export const reactionDeclarationToSnapshot = <C extends Schema, S extends string, I extends Core = {}>(
  builder: ReactionsDeclaration<C, S, I>
): SnapshotReactions | null => {
  const reactions: Record<string, any> = {}
  const states: Record<string, string[]> = {}
  let reactionAutoId = 0

  const chainResult = builder((config?: { title?: string; description?: string }) => ({
    filter: (conditions: ReactionFilterConditions) => ({
      equal: (update: ReactionUpdate<C, S, I>) => {
        const { read, write } = extractFields(update)
        const title = config?.title || ""
        const desc = config?.description
        const id = `${title}_${reactionAutoId++}`

        reactions[id] = {
          title,
          ...(desc && { desc }),
          cond: conditions,
          read,
          write,
          src: update.toString(),
        }

        return {
          title,
          update,
          filter: () => true,
          ...(desc && { description: desc }),
          registerStates: (list: S[]) => {
            for (const state of list) {
              const key = state as unknown as string
              if (!states[key]) states[key] = []
              states[key].push(id)
            }
          },
        } as unknown as Reaction<C, S, I> & { registerStates: (list: S[]) => void }
      },
    }),
  }))

  for (const [list, reaction] of chainResult) reaction.registerStates(list)

  if (Object.keys(reactions).length === 0) return null
  return { reactions, states }
}

/**
 * Создает snapshot реакций из декларации для тестов
 * @param builder - декларация реакций
 * @returns snapshot реакций
 */
export const createReactionsSnapshot = <C extends Schema, S extends string, I extends Core = {}>(
  builder: ReactionsDeclaration<C, S, I>
): SnapshotReactions => {
  return reactionDeclarationToSnapshot(builder) || { reactions: {}, states: {} }
}


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
