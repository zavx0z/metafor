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

/** Базовый класс реестра реакций */
export abstract class ReactionsBase<C extends Schema, S extends string, I extends Core = {}> {
  protected reactionsById: Map<string, Reaction<C, S, I>> = new Map()
  protected stateToReactionIds: Map<S, string[]> = new Map()
  protected reactionMetadata: Map<string, ReactionMetadata> = new Map()

  /** Получить все реакции для состояния */
  getReactions(state: S): Reaction<C, S, I>[] {
    const ids = this.stateToReactionIds.get(state) || []
    return ids.map((id) => this.reactionsById.get(id)!).filter(Boolean)
  }

  /** Исполнить все реакции для состояния */
  run(params: {
    state: S
    context: Values<C>
    core: I
    meta: string
    actor: { index: number; parent?: string }
    timestamp: number
    patch: JsonPatch
    update: Update<C>
  }) {
    const message = {
      meta: params.meta,
      actor: params.actor,
      timestamp: params.timestamp,
      patch: params.patch,
    }
    for (const reaction of this.getReactions(params.state))
      if (reaction.filter(message))
        reaction.update({
          update: params.update,
          context: params.context,
          core: params.core,
          state: params.state,
          ...message,
        })
  }

  /** Получить все уникальные реакции */
  getAllReactions(): Reaction<C, S, I>[] {
    return Array.from(this.reactionsById.values())
  }

  /** Получить все состояния, где используется реакция по id */
  getStatesForReaction(id: string): S[] {
    const result: S[] = []
    for (const [state, ids] of this.stateToReactionIds.entries()) if (ids.includes(id)) result.push(state)
    return result
  }

  /** Проверить, есть ли реакции */
  hasReactions = () => this.reactionsById.size > 0
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

/** Оригинальный реестр реакций с методом toSnapshot */
export class Reactions<C extends Schema, S extends string, I extends Core = {}> extends ReactionsBase<C, S, I> {
  private reactionAutoId = 0

  constructor(builder: ReactionsDeclaration<C, S, I>) {
    super()

    const chainResult = builder((config?: { title?: string; description?: string }) => ({
      filter: (conditions: ReactionFilterConditions) => ({
        equal: (update: ReactionUpdate<C, S, I>) => {
          // Извлекаем поля
          const { read, write } = extractFields(update)

          // Создаем реакцию
          const reaction: Reaction<C, S, I> = {
            title: config?.title || "",
            filter: createFilterFn(conditions),
            update,
            ...(config?.description && { description: config.description }),
          }

          // Генерируем ID для реакции
          const generateReactionId = (reaction: Reaction<C, S, I>) => `${reaction.title}_${this.reactionAutoId++}`

          // Проверяем на дубликаты
          let id: string | undefined
          for (const [existingId, existingReaction] of this.reactionsById.entries()) {
            if (
              existingReaction.title === reaction.title &&
              existingReaction.filter === reaction.filter &&
              existingReaction.update === reaction.update
            ) {
              id = existingId
              break
            }
          }

          // Если дубликат не найден, создаем новую реакцию
          if (!id) {
            id = generateReactionId(reaction)
            this.reactionsById.set(id, reaction)
            // Сохраняем метаданные
            this.reactionMetadata.set(id, { cond: conditions, read, write })
          }

          // Возвращаем реакцию с методом для регистрации состояний
          return {
            ...reaction,
            // Метод для регистрации состояний
            registerStates: (states: S[]) => {
              for (const state of states) {
                if (!this.stateToReactionIds.has(state)) {
                  this.stateToReactionIds.set(state, [])
                }
                this.stateToReactionIds.get(state)!.push(id!)
              }
            },
          }
        },
      }),
    }))

    // Регистрируем состояния для всех реакций
    for (const [states, reaction] of chainResult) {
      reaction.registerStates(states)
    }
  }

  /** Сериализация/экспорт */
  toSnapshot(): SnapshotReactions {
    const reactions: Record<string, any> = {}

    for (const [id, reaction] of this.reactionsById.entries()) {
      const metadata = this.reactionMetadata.get(id)
      reactions[id] = {
        title: reaction.title,
        ...(reaction.description && { desc: reaction.description }),
        cond: metadata?.cond || {},
        read: metadata?.read || [],
        write: metadata?.write || [],
        src: reaction.update.toString(),
      }
    }

    const states: Record<string, string[]> = {}
    for (const [state, ids] of this.stateToReactionIds.entries()) states[state as string] = ids

    return { reactions, states }
  }
  get snapshot(): Record<string, SnapshotReactions> {
    if (!this.hasReactions()) return {} as Record<string, SnapshotReactions>
    return { reactions: this.toSnapshot() }
  }
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

