/**
 * Утилиты для работы с ReactionMap
 */
import type { ContextSchema } from "../context"
import type { Reaction, ReactionFilterArgs, ReactionsDeclaration, ReactionsMap } from "./index.t"
import type { Update, ExtractValues } from "../context/index.t"

/**
 * Реестр реакций с deduped-структурой для экономии памяти и удобного API.
 */
export class ReactionRegistry<C extends ContextSchema, S extends string, Core = Record<string, any>> {
  private reactionsById: Map<string, Reaction<C, S, Core>>
  private stateToReactionIds: Map<S, string[]>

  constructor(declaration: ReactionsDeclaration<C, S, Core>, update: Update<C>) {
    const { reactionsById, stateToReactionIds } = createDedupedReactionsConfig(declaration, update)
    this.reactionsById = reactionsById
    this.stateToReactionIds = stateToReactionIds
  }

  /** Получить все реакции для состояния */
  getReactions(state: S): Reaction<C, S, Core>[] {
    const ids = this.stateToReactionIds.get(state) || []
    return ids.map((id) => this.reactionsById.get(id)!).filter(Boolean)
  }

  /** Исполнить все реакции для состояния */
  run(
    state: S,
    filterArgs: ReactionFilterArgs<C, S>,
    updateArgs: { update: Update<C>; context: ExtractValues<C>; core: Core }
  ): void {
    for (const reaction of this.getReactions(state)) {
      if (reaction.filter(filterArgs)) {
        reaction.update(updateArgs)
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
  declaration: ReactionsDeclaration<C, S, Core>,
  update: Update<C>
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
  const declarations = declaration(update)
  for (const [states, value] of declarations) {
    const { title, filter, update } = value
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
