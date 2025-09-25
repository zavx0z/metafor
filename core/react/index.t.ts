/**
 * Типы для реакций
 * @packageDocumentation
 * @module Reactions
 */

import type { Schema } from "@zavx0z/context"
import type { ActorInfo, Core, JsonPatch } from "../index.t"

import type { ReactionFilterConditions as ReactionConditions } from "./condition.t"
import type { ReactionUpdate } from "../../schema/reactions.t"

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

/**
 * Метаданные реакции
 */
export type ReactionMetadata = {
  cond: ReactionConditions
  read: string[]
  write: string[]
}
