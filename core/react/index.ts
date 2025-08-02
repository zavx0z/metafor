/**
 * Реализация реакций
 * @module Reactions
 */
import type { ContextSchema, ExtractValues, Update } from "../context/index.t"
import type { Core } from "../index.t"
import type { JsonPatch, Message, MetaDataMessage } from "../message"
import type {
  ReactionsChain,
  ReactionUpdate,
  Reaction,
  SnapshotReactions,
  ReactionMetadata,
  ReactionsChainResult,
} from "./index.t"
import type { ReactionFilterConditions } from "./condition.t"
import { checkStringCondition, checkNumberCondition, checkValueCondition } from "./condition"

type RunParams<C extends ContextSchema, S extends string, I extends Core> = {
  state: S
  context: ExtractValues<C>
  core: I
  meta: MetaDataMessage
  patch: JsonPatch
  update: Update<C>
}
/**
 * Реестр реакций с deduped-структурой для экономии памяти и удобного API.
 */
export class ReactionRegistry<C extends ContextSchema, S extends string, I extends Core = {}> {
  private reactionsById: Map<string, Reaction<C, S, I>>
  private stateToReactionIds: Map<S, string[]>
  private reactionMetadata: Map<string, ReactionMetadata>

  constructor(builder: ReactionsChain<C, S, I>) {
    const chainResult = builder((config?: { title?: string; description?: string }) => ({
      filter: (conditions: ReactionFilterConditions) => ({
        equal: (updateFn: ReactionUpdate<C, S, I>) => {
          // Создаем функцию фильтрации на основе декларативных условий
          const filterFn = ({ meta, patch }: Message): boolean => {
            // Проверяем условия для метаданных
            if (conditions.tag !== undefined && !checkStringCondition(meta.tag, conditions.tag)) return false
            if (conditions.index !== undefined && !checkNumberCondition(meta.index || 0, conditions.index)) return false
            if (conditions.timestamp !== undefined && !checkNumberCondition(meta.timestamp || 0, conditions.timestamp))
              return false
            // Проверяем условия для патча
            if (conditions.op !== undefined && patch.op !== conditions.op) return false
            if (conditions.path !== undefined && patch.path !== conditions.path) return false
            if (conditions.value !== undefined && !checkValueCondition(patch.value, conditions.value)) return false
            return true
          }
          // Анализируем функцию update для извлечения полей
          const updateStr = updateFn.toString()
          const readFields: string[] = []
          const writeFields: string[] = []
          // Извлекаем поля, которые читаются из контекста
          const contextMatches = updateStr.match(/context\.(\w+)/g)
          if (contextMatches) {
            for (const match of contextMatches) {
              const field = match.replace("context.", "")
              if (!readFields.includes(field)) {
                readFields.push(field)
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
                if (!writeFields.includes(field)) {
                  writeFields.push(field)
                }
              }
            }
          }
          // Согласно тесту, если поле записывается, то оно также читается
          for (const writeField of writeFields) {
            if (!readFields.includes(writeField)) {
              readFields.push(writeField)
            }
          }
          return {
            filter: filterFn,
            update: updateFn,
            title: config?.title || "",
            description: config?.description || "",
            filterConditions: conditions,
            readFields,
            writeFields,
          }
        },
      }),
    }))
    const { reactionsById, stateToReactionIds, reactionMetadata } = createDedupedReactionsConfig<C, S, I>(chainResult)
    this.reactionsById = reactionsById
    this.stateToReactionIds = stateToReactionIds
    this.reactionMetadata = reactionMetadata
  }

  /** Получить все реакции для состояния */
  getReactions(state: S): Reaction<C, S, I>[] {
    const ids = this.stateToReactionIds.get(state) || []
    return ids.map((id) => this.reactionsById.get(id)!).filter(Boolean)
  }

  /** Исполнить все реакции для состояния */
  run({ state, context, core, meta, patch, update }: RunParams<C, S, I>): void {
    for (const reaction of this.getReactions(state)) {
      if (reaction.filter({ meta, patch })) {
        reaction.update({ update, context, core, meta, patch, state })
      }
    }
  }

  /** Получить все уникальные реакции */
  getAllReactions(): Reaction<C, S, I>[] {
    return Array.from(this.reactionsById.values())
  }

  /** Получить все состояния, где используется реакция по id */
  getStatesForReaction(id: string): S[] {
    const result: S[] = []
    for (const [state, ids] of this.stateToReactionIds.entries()) {
      if (ids.includes(id)) result.push(state)
    }
    return result
  }

  /** Проверить, есть ли реакции */
  hasReactions(): boolean {
    return this.reactionsById.size > 0
  }

  /** Сериализация/экспорт */
  toSnapshot(): SnapshotReactions {
    const reactions: Record<string, any> = {}

    for (const [id, reaction] of this.reactionsById.entries()) {
      const metadata = this.reactionMetadata.get(id)
      reactions[id] = {
        title: reaction.title,
        ...(reaction.description && { description: reaction.description }),
        filter: metadata?.filterConditions || {},
        equal: {
          read: metadata?.readFields || [],
          write: metadata?.writeFields || [],
        },
      }
    }

    const states: Record<string, string[]> = {}
    for (const [state, ids] of this.stateToReactionIds.entries()) {
      states[state as string] = ids
    }

    return { reactions, states }
  }
}

/**
 * Вспомогательная функция для создания deduped-структуры реакций.
 */
function createDedupedReactionsConfig<C extends ContextSchema, S extends string, I extends Core>(
  chainResult: ReactionsChainResult<C, S, I>
): {
  reactionsById: Map<string, Reaction<C, S, I>>
  stateToReactionIds: Map<S, string[]>
  reactionMetadata: Map<string, ReactionMetadata>
} {
  let reactionAutoId = 0
  function generateReactionId(reaction: Reaction<C, S, I>): string {
    return `${reaction.title}_${reactionAutoId++}`
  }
  const reactionsById = new Map<string, Reaction<C, S, I>>()
  const stateToReactionIds = new Map<S, string[]>()
  const reactionMetadata = new Map<string, ReactionMetadata>()

  // Преобразуем chain результат в декларацию
  const declarations = chainResult.map(([states, reaction]) => [states, reaction]) as [
    S[],
    {
      filter: (args: Message) => boolean
      update: ReactionUpdate<C, S, I>
      title: string
      description?: string
      filterConditions: ReactionFilterConditions
      readFields: string[]
      writeFields: string[]
    }
  ][]

  for (const [states, value] of declarations) {
    const { filter, update, title, description, filterConditions, readFields, writeFields } = value
    const reaction: Reaction<C, S, I> = { title, filter, update, ...(description && { description }) }
    let id = undefined
    for (const [existingId, existingReaction] of reactionsById.entries()) {
      if (
        existingReaction.title === reaction.title &&
        existingReaction.filter === reaction.filter &&
        existingReaction.update === reaction.update
      ) {
        id = existingId
        break
      }
    }
    if (!id) {
      id = generateReactionId(reaction)
      reactionsById.set(id, reaction)
      // Сохраняем метаданные
      reactionMetadata.set(id, { filterConditions, readFields, writeFields })
    }
    for (const state of states) {
      if (!stateToReactionIds.has(state)) stateToReactionIds.set(state, [])
      stateToReactionIds.get(state)!.push(id)
    }
  }
  return { reactionsById, stateToReactionIds, reactionMetadata }
}
