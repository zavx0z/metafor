/**
 * Типы для реакций
 * @packageDocumentation
 * @module Reactions
 */

import type { Schema, Update, Values } from "@zavx0z/context"
import type { Core } from "../index.t"
import type { ActorInfo, JsonPatch } from "../message"
import type { ReactionFilterConditions as ReactionConditions } from "./condition.t"

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
export type ReactionParams = {
  meta: string
  actor: ActorInfo
  timestamp: number
  patch: JsonPatch
}
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
    filter: (conditions: ReactionConditions) => {
      /** Добавляет функцию обработки события */
      equal: (updateFn: ReactionUpdate<C, S, I>) => Reaction<C, S, I> & {
        /** Метод для регистрации состояний */
        registerStates: (states: S[]) => void
      }
    }
  }
) => ReactionsChainResult<C, S, I>

/** Результат цепочки реакций */
export type ReactionsChainResult<C extends Schema, S extends string, I extends Core> = [
  S[],
  Reaction<C, S, I> & {
    /** Метод для регистрации состояний */
    registerStates: (states: S[]) => void
  },
][]

/**
 * Карта реакций по состояниям
 *
 * Внутренний тип для хранения реакций, сгруппированных по состояниям.
 *
 * @template C - схема контекста
 * @template S - строковые ключи состояний
 * @template Core - тип core объекта
 */
export type ReactionsMap<C extends Schema, S extends string, I extends Core> = Map<S, Reaction<C, S, I>[]>

/** Снимок реакций */
export type SnapshotReactions = {
  reactions: Record<
    string,
    {
      title: string
      desc?: string
      cond: ReactionConditions
      read?: string[]
      write?: string[]
      src: string
    }
  >
  states: Record<string, string[]>
}
/**
 * Метаданные реакции
 */
export type ReactionMetadata = {
  cond: ReactionConditions
  read: string[]
  write: string[]
}
