import type { ContextSchema, ExtractValues } from "../context/index.t"
import type { JsonPatch, MetaDataMessage } from "../message"

/**
 * Аргументы для функции фильтрации
 */
export type ReactionFilterArgs<C extends ContextSchema, S extends string> = {
  meta: MetaDataMessage
  patch: JsonPatch
  context: ExtractValues<C>
  state: S
}

/**
 * Функция обновления контекста
 */
export type ReactionUpdate<C extends ContextSchema, S extends string, Core = Record<string, any>> = (args: {
  update: (values: Partial<ExtractValues<C>>) => void
  context: ExtractValues<C>
  core: Core
  meta: MetaDataMessage
  patch: JsonPatch
  state: S
}) => void

/**
 * Декларативные условия фильтрации
 */
export type ReactionFilterConditions = {
  tag?: string
  index?: number
  timestamp?: number
  op?: "replace" | "add" | "remove" | "test"
  path?: "/context" | "/state" | "/"
  value?: any
}

/**
 * Реакция
 */
export type Reaction<C extends ContextSchema, S extends string, Core = Record<string, any>> = {
  title: string
  description?: string
  filter: (args: ReactionFilterArgs<C, S>) => boolean
  update: ReactionUpdate<C, S, Core>
}

/**
 * Chain API для создания реакции
 */
export type ReactionChain<C extends ContextSchema, S extends string, Core = Record<string, any>> = (
  config: { title: string; description?: string }
) => {
  filter: (conditions: ReactionFilterConditions) => {
    equal: (updateFn: ReactionUpdate<C, S, Core>) => {
      filter: (args: ReactionFilterArgs<C, S>) => boolean
      update: ReactionUpdate<C, S, Core>
      title: string
      description?: string
    }
  }
}

/**
 * Chain API для создания реакций
 */
export type ReactionsChain<C extends ContextSchema, S extends string, Core = Record<string, any>> = (
  reaction: ReactionChain<C, S, Core>
) => [S[], { filter: (args: ReactionFilterArgs<C, S>) => boolean; update: ReactionUpdate<C, S, Core>; title: string; description?: string }][]

/**
 * Карта реакций для быстрого поиска по состоянию.
 * Ключ — строка состояния, значение — массив реакций для этого состояния.
 */
export type ReactionsMap<C extends ContextSchema, S extends string, Core = Record<string, any>> = Map<
  S,
  Reaction<C, S, Core>[]
>

/**
 * Функция обновления
 */
export type Update<C extends ContextSchema> = (values: Partial<ExtractValues<C>>) => void
