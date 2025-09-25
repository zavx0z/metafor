import type { Schema, Update, Values } from "@zavx0z/context"
import type { ActorInfo, Core, JsonPatch } from "../core/index.t"
import type { ReactionFilterConditions } from "../core/react/condition.t"
import type { Reaction, ReactionsChainResult } from "../core/react/index.t"

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

/** Схема реакций */
export type ReactionsSchema = {
  reactions: Record<
    string,
    {
      title: string
      desc?: string
      cond: ReactionFilterConditions
      read?: string[]
      write?: string[]
      src: string
    }
  >
  states: Record<string, string[]>
} /**
 * Функция обновления контекста
 *
 * Вызывается когда реакция срабатывает и фильтр прошел успешно.
 * Получает все необходимые данные для обработки события.
 *
 * @template C - схема контекста
 * @template S - строковые ключи состояний
 * @template Core - тип core объекта
 *
 * @includeExample ./react/test/reactions.basic.spec.ts
 * @includeExample ./react/test/reactions.execution.spec.ts
 *
 * @example
 * ```typescript
 * const updateFn: ReactionUpdate<MyContext, "idle" | "loading"> = ({
 *   update,    // Функция для обновления контекста
 *   context,   // Текущий контекст
 *   core,      // Core объект
 *   message,   // Полное сообщение
 *   state      // Текущее состояние
 * }) => {
 *   // Обработка события
 *   update({
 *     lastMessage: message.patch.value,
 *     messageCount: context.messageCount + 1,
 *     senderMeta: message.meta,
 *     actorIndex: message.actor.index
 *   })
 * }
 * ```
 */

export type ReactionUpdate<C extends Schema, S extends string, I extends Core> = (args: {
  /** Функция для обновления контекста */
  update: Update<C>
  /** Текущий контекст */
  context: Values<C>
  /** Core объект */
  core: I
  /** Хеш меты компонента-актора */
  meta: string
  /** Информация об акторе */
  actor: ActorInfo
  /** Временная метка */
  timestamp: number
  /** Патч для применения к актору */
  patch: JsonPatch
  /** Текущее состояние */
  state: S
}) => void
