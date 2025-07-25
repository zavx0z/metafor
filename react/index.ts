/**
 * Утилиты для работы с ReactionMap
 */
import type { Reaction, ReactionMap, ReactionActionArgs, ReactionFilterArgs } from "./index.t"

/**
 * Создаёт карту реакций из массива кортежей [ключи, реакция/реакции]
 * @param entries Массив кортежей [массив состояний, реакция или массив реакций]
 */
export function createReactionMap<C = any, Meta = any, Patch = any, Core = any>(
  entries: ([string[], Reaction<C, Meta, Patch, Core>] | [string[], Reaction<C, Meta, Patch, Core>[]])[]
): ReactionMap<C, Meta, Patch, Core> {
  const map: ReactionMap<C, Meta, Patch, Core> = new Map()
  for (const [keys, value] of entries) {
    const arr = Array.isArray(value) ? value : [value]
    map.set(keys, arr)
  }
  return map
}

/**
 * Находит все реакции, подходящие для текущего состояния
 * @param map ReactionMap
 * @param state Текущее состояние (строка)
 * @returns Массив реакций
 */
export function findReactions<C = any, Meta = any, Patch = any, Core = any>(
  map: ReactionMap<C, Meta, Patch, Core>,
  state: string
): Reaction<C, Meta, Patch, Core>[] {
  const result: Reaction<C, Meta, Patch, Core>[] = []
  for (const [keys, reactions] of map.entries()) {
    if (keys.includes(state)) result.push(...reactions)
  }
  return result
}

/**
 * Запускает все реакции, у которых filter возвращает true
 * @param reactions Массив реакций
 * @param filterArgs Аргументы для filter
 * @param actionArgs Аргументы для action
 */
export function runReactions<C = any, Meta = any, Patch = any, Core = any>(
  reactions: Reaction<C, Meta, Patch, Core>[],
  filterArgs: ReactionFilterArgs<C, Meta, Patch>,
  actionArgs: ReactionActionArgs<C, Meta, Patch, Core>
) {
  for (const reaction of reactions) {
    if (reaction.filter(filterArgs)) {
      reaction.action(actionArgs)
    }
  }
}
