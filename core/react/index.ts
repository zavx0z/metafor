/**
 * Реализация реакций
 * @module Reactions
 */
import type { ContextSchema, ExtractValues, Update } from "../context/index.t"
import type { Core } from "../index.t"
import type { JsonPatch, MetaDataMessage } from "../message"
import type { ReactionsChain, ReactionUpdate, Reaction, SnapshotReactions, ReactionMetadata } from "./index.t"
import type { ReactionFilterConditions } from "./condition.t"
import { createFilterFn } from "./condition"

/**
 * Анализирует функцию update для извлечения полей
 */
function extractFields<C extends ContextSchema, S extends string, I extends Core>(update: ReactionUpdate<C, S, I>) {
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
export abstract class ReactionRegistry<C extends ContextSchema, S extends string, I extends Core = {}> {
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
    context: ExtractValues<C>
    core: I
    meta: MetaDataMessage
    patch: JsonPatch
    update: Update<C>
  }) {
    for (const reaction of this.getReactions(params.state))
      if (reaction.filter({ meta: params.meta, patch: params.patch })) reaction.update(params)
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

/** Оригинальный реестр реакций с методом toSnapshot */
export class ReactionRegistryOrigin<
  C extends ContextSchema,
  S extends string,
  I extends Core = {}
> extends ReactionRegistry<C, S, I> {
  private reactionAutoId = 0

  constructor(builder: ReactionsChain<C, S, I>) {
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
      }
    }

    const states: Record<string, string[]> = {}
    for (const [state, ids] of this.stateToReactionIds.entries()) states[state as string] = ids

    return { reactions, states }
  }
}

/** Клонированный реестр реакций с методом fromSnapshot */
export class ReactionRegistryClone<
  C extends ContextSchema,
  S extends string,
  I extends Core = {}
> extends ReactionRegistry<C, S, I> {
  constructor() {
    super()
  }

  /** Создание из снимка */
  static fromSnapshot<C extends ContextSchema, S extends string, I extends Core = {}>(
    snapshot: SnapshotReactions
  ): ReactionRegistryClone<C, S, I> {
    const registry = new ReactionRegistryClone<C, S, I>()

    // Восстанавливаем реакции из снимка
    for (const [id, reactionData] of Object.entries(snapshot.reactions)) {
      // Создаем заглушку для реакции (без реальной функции update)
      const reaction: Reaction<C, S, I> = {
        title: reactionData.title,
        filter: () => false, // Заглушка - не будет выполняться
        update: () => {}, // Заглушка - не будет выполняться
        ...(reactionData.desc && { description: reactionData.desc }),
      }

      registry.reactionsById.set(id, reaction)
      registry.reactionMetadata.set(id, {
        cond: reactionData.cond,
        read: reactionData.read || [],
        write: reactionData.write || [],
      })
    }

    // Восстанавливаем состояния
    for (const [state, ids] of Object.entries(snapshot.states)) {
      registry.stateToReactionIds.set(state as S, ids)
    }

    return registry
  }
}
