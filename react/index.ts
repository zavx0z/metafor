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
  ReactionsMap,
  Update,
} from "./index.t"

/**
 * Проверяет условие для строкового значения
 */
function checkStringCondition(value: string, condition: any): boolean {
  if (typeof condition === "string") {
    return value === condition
  }
  if (condition instanceof RegExp) {
    return condition.test(value)
  }
  if (typeof condition === "object" && condition !== null) {
    if (condition.eq !== undefined && value !== condition.eq) return false
    if (condition.notEq !== undefined && value === condition.notEq) return false
    if (condition.startsWith !== undefined && !value.startsWith(condition.startsWith)) return false
    if (condition.endsWith !== undefined && !value.endsWith(condition.endsWith)) return false
    if (condition.include !== undefined && !value.includes(condition.include)) return false
    if (condition.notInclude !== undefined && value.includes(condition.notInclude)) return false
    if (condition.notStartsWith !== undefined && value.startsWith(condition.notStartsWith)) return false
    if (condition.notEndsWith !== undefined && value.endsWith(condition.notEndsWith)) return false
    if (condition.pattern !== undefined && !condition.pattern.test(value)) return false
    if (condition.length !== undefined) {
      if (typeof condition.length === "number") {
        if (value.length !== condition.length) return false
      } else {
        if (condition.length.min !== undefined && value.length < condition.length.min) return false
        if (condition.length.max !== undefined && value.length > condition.length.max) return false
      }
    }
    if (condition.between !== undefined) {
      const [min, max] = condition.between
      if (value < min || value > max) return false
    }
  }
  return true
}

/**
 * Проверяет условие для числового значения
 */
function checkNumberCondition(value: number, condition: any): boolean {
  if (typeof condition === "number") {
    return value === condition
  }
  if (typeof condition === "object" && condition !== null) {
    if (condition.eq !== undefined && value !== condition.eq) return false
    if (condition.notEq !== undefined && value === condition.notEq) return false
    if (condition.gt !== undefined && value <= condition.gt) return false
    if (condition.gte !== undefined && value < condition.gte) return false
    if (condition.lt !== undefined && value >= condition.lt) return false
    if (condition.lte !== undefined && value > condition.lte) return false
    if (condition.notGt !== undefined && value > condition.notGt) return false
    if (condition.notGte !== undefined && value >= condition.notGte) return false
    if (condition.notLt !== undefined && value < condition.notLt) return false
    if (condition.notLte !== undefined && value <= condition.notLte) return false
    if (condition.between !== undefined) {
      const [min, max] = condition.between
      if (value < min || value > max) return false
    }
  }
  return true
}

/**
 * Проверяет условие для булевого значения
 */
function checkBooleanCondition(value: boolean, condition: any): boolean {
  if (typeof condition === "boolean") {
    return value === condition
  }
  if (typeof condition === "object" && condition !== null) {
    if (condition.eq !== undefined && value !== condition.eq) return false
    if (condition.notEq !== undefined && value === condition.notEq) return false
    if (condition.logicalEq !== undefined && Boolean(value) !== condition.logicalEq) return false
  }
  return true
}

/**
 * Проверяет условие для массива
 */
function checkArrayCondition(value: any[], condition: any): boolean {
  if (Array.isArray(condition)) {
    return JSON.stringify(value) === JSON.stringify(condition)
  }
  if (typeof condition === "object" && condition !== null) {
    if (condition.length !== undefined) {
      if (typeof condition.length === "number") {
        if (value.length !== condition.length) return false
      } else {
        if (condition.length.min !== undefined && value.length < condition.length.min) return false
        if (condition.length.max !== undefined && value.length > condition.length.max) return false
      }
    }
    if (condition.includes !== undefined && !value.includes(condition.includes)) return false
    if (condition.notIncludes !== undefined && value.includes(condition.notIncludes)) return false
    if (condition.isEmpty !== undefined && (condition.isEmpty ? value.length !== 0 : value.length === 0)) return false
    if (condition.every !== undefined) {
      if (
        !value.every((item) => {
          if (typeof item === "number") return checkNumberCondition(item, condition.every)
          if (typeof item === "string") return checkStringCondition(item, condition.every)
          return false
        })
      )
        return false
    }
    if (condition.some !== undefined) {
      if (
        !value.some((item) => {
          if (typeof item === "number") return checkNumberCondition(item, condition.some)
          if (typeof item === "string") return checkStringCondition(item, condition.some)
          return false
        })
      )
        return false
    }
  }
  return true
}

/**
 * Проверяет условие для любого значения
 */
function checkValueCondition(value: any, condition: any): boolean {
  // Проверка на null
  if (condition === null) {
    return value === null
  }

  // Проверка на undefined
  if (condition === undefined) {
    return value === undefined
  }

  // Проверка на null в объекте условий
  if (typeof condition === "object" && condition !== null && condition.null !== undefined) {
    if (condition.null && value !== null) return false
    if (!condition.null && value === null) return false
    return true // Если проверка null прошла успешно, возвращаем true
  }

  // Проверка по типу значения
  if (typeof value === "string") {
    return checkStringCondition(value, condition)
  }
  if (typeof value === "number") {
    return checkNumberCondition(value, condition)
  }
  if (typeof value === "boolean") {
    return checkBooleanCondition(value, condition)
  }
  if (Array.isArray(value)) {
    return checkArrayCondition(value, condition)
  }

  // Для объектов и других типов - прямое сравнение
  if (typeof condition === "object" && condition !== null) {
    // Если это объект условий, но не подходящий тип - возвращаем false
    if (condition.eq !== undefined || condition.gt !== undefined || condition.startsWith !== undefined) {
      return false
    }
  }

  // Прямое сравнение для объектов и других типов
  return JSON.stringify(value) === JSON.stringify(condition)
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
            const filterFn = (args: ReactionFilterArgs): boolean => {
              const { meta, patch } = args

              // Проверяем условия для метаданных
              if (conditions.tag !== undefined && !checkStringCondition(meta.tag, conditions.tag)) return false
              if (conditions.index !== undefined && !checkNumberCondition(meta.index || 0, conditions.index))
                return false
              if (
                conditions.timestamp !== undefined &&
                !checkNumberCondition(meta.timestamp || 0, conditions.timestamp)
              )
                return false

              // Проверяем условия для патча
              if (conditions.op !== undefined && patch.op !== conditions.op) return false
              if (conditions.path !== undefined && patch.path !== conditions.path) return false
              if (conditions.value !== undefined && !checkValueCondition(patch.value, conditions.value)) return false

              return true
            }

            return { filter: filterFn, update: updateFn, title: config.title, description: config.description }
          },
        }
      },
    }
  }) as ReactionChain<C, S, Core>
}

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
      if (reaction.filter({ meta, patch })) {
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
      filter: (args: ReactionFilterArgs) => boolean
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
