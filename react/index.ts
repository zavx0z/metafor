/**
 * Утилиты для работы с ReactionMap
 */
import type { ContextSchema, ExtractValues } from "../context/index.t"
import type { JsonPatch, MetaDataMessage } from "../message"
import type {
  ReactionChain,
  ReactionsChain,
  ReactionFilterArgs,
  ReactionUpdate,
  ReactionFilterConditions,
  Reaction,
  Update,
} from "./index.t"

/**
 * Реестр реакций с deduped-структурой для экономии памяти и удобного API.
 */
export class ReactionRegistry<C extends ContextSchema, S extends string, Core = Record<string, any>> {
  private reactionsById: Map<string, Reaction<C, S, Core>>
  private stateToReactionIds: Map<S, string[]>

  constructor(builder: ReactionsChain<C, S, Core>) {
    const chain = createReactionsChain<C, S, Core>()
    const chainResult = builder(chain)
    const { reactionsById, stateToReactionIds } = createDedupedReactionsConfig<C, S, Core>(chainResult)
    this.reactionsById = reactionsById
    this.stateToReactionIds = stateToReactionIds
  }

  /** Получить все реакции для состояния */
  getReactions(state: S): Reaction<C, S, Core>[] {
    const ids = this.stateToReactionIds.get(state) || []
    return ids.map((id) => this.reactionsById.get(id)!).filter(Boolean)
  }

  /** Исполнить все реакции для состояния */
  run({
    state,
    context,
    core,
    meta,
    patch,
    update,
  }: {
    state: S
    context: ExtractValues<C>
    core: Core
    meta: MetaDataMessage
    patch: JsonPatch
    update: Update<C>
  }): void {
    for (const reaction of this.getReactions(state)) {
      if (reaction.filter({ context, meta, patch, state })) {
        reaction.update({ update, context, core, meta, patch, state })
      }
    }
  }

  /** Получить все уникальные реакции */
  getAllReactions(): Reaction<C, S, Core>[] {
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
  toJSON(): { reactions: any[]; states: Record<string, string[]> } {
    const reactions = Array.from(this.reactionsById.entries()).map(([id, reaction]) => ({ id, ...reaction }))
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
function createDedupedReactionsConfig<C extends ContextSchema, S extends string, Core = Record<string, any>>(
  chainResult: any[]
): {
  reactionsById: Map<string, Reaction<C, S, Core>>
  stateToReactionIds: Map<S, string[]>
} {
  let reactionAutoId = 0
  function generateReactionId(reaction: Reaction<C, S, Core>): string {
    return `${reaction.title}_${reactionAutoId++}`
  }
  const reactionsById = new Map<string, Reaction<C, S, Core>>()
  const stateToReactionIds = new Map<S, string[]>()

  // Преобразуем chain результат в декларацию
  const declarations = chainResult.map(([states, reaction]) => [states, reaction]) as [
    S[],
    {
      filter: (args: ReactionFilterArgs<C, S>) => boolean
      update: ReactionUpdate<C, S, Core>
      title: string
      description?: string
    }
  ][]

  for (const [states, value] of declarations) {
    const { filter, update, title } = value
    const reaction: Reaction<C, S, Core> = { title, filter, update }
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
    }
    for (const state of states) {
      if (!stateToReactionIds.has(state)) stateToReactionIds.set(state, [])
      stateToReactionIds.get(state)!.push(id)
    }
  }
  return { reactionsById, stateToReactionIds }
}

/**
 * Создает chain API для реакций
 */
export function createReactionsChain<
  C extends ContextSchema,
  S extends string,
  Core = Record<string, any>
>(): ReactionChain<C, S, Core> {
  return ((config: { title: string; description?: string }) => {
    return {
      filter: (conditions: ReactionFilterConditions) => {
        return {
          equal: (updateFn: ReactionUpdate<C, S, Core>) => {
            // Создаем функцию фильтрации на основе декларативных условий
            const filterFn = (args: ReactionFilterArgs<C, S>): boolean => {
              const { meta, patch } = args

              // Проверяем каждое условие
              if (conditions.tag !== undefined && meta.tag !== conditions.tag) return false
              if (conditions.index !== undefined && meta.index !== conditions.index) return false
              if (conditions.timestamp !== undefined && meta.timestamp !== conditions.timestamp) return false
              if (conditions.op !== undefined && patch.op !== conditions.op) return false
              if (conditions.path !== undefined && patch.path !== conditions.path) return false
              if (conditions.value !== undefined && patch.value !== conditions.value) return false

              return true
            }

            return { filter: filterFn, update: updateFn, title: config.title, description: config.description }
          },
        }
      },
    }
  }) as ReactionChain<C, S, Core>
}
