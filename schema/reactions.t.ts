import type { Schema } from "@zavx0z/context"
import type { Core } from "../core/index.t"
import type { ReactionFilterConditions } from "../core/react/condition.t"
import type { ReactionUpdate, Reaction, ReactionsChainResult, SnapshotReactions } from "../core/react/index.t"
import { serializeReaction } from "./reactions"

/**
 * Цепочка для создания массива реакций
 *
 * Позволяет создавать массив реакций с группировкой по состояниям.
 *
 * @template C - схема контекста
 * @template S - строковые ключи состояний
 * @template Core - тип core объекта
 *
 * @example
 * ```typescript
 * const reactions: ReactionsChain<MyContext, "idle" | "loading"> = (reaction) => [
 *   [
 *     ["idle", "loading"], // Состояния
 *     reaction({ title: "Обработка сообщений" })
 *       .filter({ meta: "user" })
 *       .equal(({ update, patch }) => {
 *         update({ lastMessage: patch.value })
 *       })
 *   ]
 * ]
 * ```
 */

export type ReactionsDeclaration<C extends Schema, S extends string, I extends Core> = (
  reaction: (config?: {
    /** Название реакции */
    title?: string
    /** Описание реакции */
    description?: string
  }) => {
    /** Добавляет декларативные фильтры */
    filter: (conditions: ReactionFilterConditions) => {
      /** Добавляет функцию обработки события */
      equal: (updateFn: ReactionUpdate<C, S, I>) => Reaction<C, S, I> & {
        /** Метод для регистрации состояний */
        registerStates: (states: S[]) => void
      }
    }
  }
) => ReactionsChainResult<C, S, I> /**
 * Создает snapshot реакций из декларации для тестов
 * @param builder - декларация реакций
 * @returns snapshot реакций
 */

export const createReactionsSnapshot = <C extends Schema, S extends string, I extends Core = {}>(
  builder: ReactionsDeclaration<C, S, I>
): SnapshotReactions => {
  return serializeReaction(builder) || { reactions: {}, states: {} }
}
