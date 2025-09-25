import type { Schema, Update, Values } from "@zavx0z/context"
import type { ActorInfo, Core, JsonPatch } from "../core/index.t"
import type { ReactionFilterConditions } from "../core/condition.t"
import type { ReactionParams } from "../core/reactions.t"

/**
 * Конфигурация одной реакции
 *
 * Содержит название, описание, функцию фильтрации и функцию обновления.
 *
 * @template C - схема контекста
 * @template S - строковые ключи состояний
 * @template Core - тип core объекта
 *
 * @example
 * ```typescript
 * const reaction: Reaction<MyContext, "idle" | "loading"> = {
 *   title: "Обработка сообщений",
 *   description: "Обрабатывает входящие сообщения от пользователей",
 *   filter: ({ meta, patch }) => {
 *     return meta === "user" && patch.op === "replace"
 *   },
 *   update: ({ update, context, patch }) => {
 *     update({
 *       lastMessage: patch.value,
 *       messageCount: context.messageCount + 1
 *     })
 *   }
 * }
 * ```
 */
export type Reaction<C extends Schema, S extends string, I extends Core> = {
  /** Название реакции для документации */
  title: string
  /** Описание реакции для документации */
  description?: string
  /** Функция фильтрации событий */
  filter: (args: ReactionParams) => boolean
  /** Функция обработки события */
  update: ReactionUpdate<C, S, I>
}

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
}) => void /** Результат цепочки реакций */

export type ReactionsChainResult<C extends Schema, S extends string, I extends Core> = [
  S[],
  Reaction<C, S, I> & {
    /** Метод для регистрации состояний */
    registerStates: (states: S[]) => void
  },
][]
