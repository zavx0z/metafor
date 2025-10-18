import type { Schema, Update, Values } from "@zavx0z/context"
import type { JsonPatch } from "../actor/electromagnetic.t"
import type { Core } from "../actor/gravity.t"
import type { ReactionFilterConditions } from "../actor/src/condition.t"
import type { ReactionParams } from "../actor/src/reactions.t"
import type { Self } from "./metafor.t"
import type { Destroy } from "../actor/field.t"

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
 *   label: "Обработка сообщений",
 *   desc: "Обрабатывает входящие сообщения от пользователей",
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
  label: string
  /** Описание реакции для документации */
  desc?: string
  /** Функция фильтрации событий */
  filter: (args: ReactionParams) => boolean
  /** Функция обработки события */
  update: ReactionAction<C, S, I>
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
 *     reaction({ label: "Обработка сообщений" })
 *       .filter(({ self }) => ({ meta: "user", actor: self.actor.split("/")[1] }))
 *       .equal(({ update, patch, destroy }) => {
 *         update({ lastMessage: patch.value })
 *         // destroy() доступен в equal, но не в filter
 *       })
 *   ]
 * ]
 * ```
 */

export type ReactionsDeclaration<C extends Schema, S extends string, I extends Core> = (
  reaction: (config?: {
    /** Название реакции */
    label?: string
    /** Описание реакции */
    desc?: string
  }) => {
    /** Добавляет декларативные фильтры (использует SelfInfo без destroy) */
    filter: (filter: (params: { self: Self; context: Values<C> }) => ReactionFilterConditions) => {
      /** Добавляет функцию обработки события (использует Self с destroy) */
      equal: (reaction: ReactionAction<C, S, I>) => Reaction<C, S, I> & {
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
      label: string
      desc?: string
      cond: string
      read?: string[]
      write?: string[]
      src: string
    }
  >
  states: Record<string, string[]>
}
/**
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
 *   destroy,   // Функция для уничтожения актора
 *   context,   // Текущий контекст
 *   core,      // Core объект
 *   meta,      // Мета-информация отправителя
 *   actor,     // ID актора-отправителя
 *   timestamp, // Временная метка
 *   patch,     // Патч данных
 *   state,     // Текущее состояние
 *   self       // Полный идентификатор актора
 * }) => {
 *   // Обработка события
 *   update({
 *     lastMessage: patch.value,
 *     messageCount: context.messageCount + 1
 *   })
 *   // destroy() доступен для уничтожения актора
 * }
 * ```
 */

export type ReactionAction<C extends Schema, S extends string, I extends Core> = (args: {
  /** Функция для обновления контекста */
  update: Update<C>
  /** Функция для уничтожения актора */
  destroy: Destroy
  /** Текущий контекст */
  context: Values<C>
  /** Core объект */
  core: I
  /** Хеш меты компонента-актора */
  meta: string
  /** Информация об акторе */
  actor: string
  /** Временная метка */
  timestamp: number
  /** Патч для применения к актору */
  patch: JsonPatch
  /** Текущее состояние */
  state: S
  /** Идентификатор актора */
  self: Self
}) => void /** Результат цепочки реакций */

export type ReactionsChainResult<C extends Schema, S extends string, I extends Core> = [
  S[],
  Reaction<C, S, I> & {
    /** Метод для регистрации состояний */
    registerStates: (states: S[]) => void
  }
][]
