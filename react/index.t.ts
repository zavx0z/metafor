import type { Update, ExtractValues } from "../context/index.t"
import type { JsonPatch, MetaDataMessage, Message } from "../message"
import type { ContextSchema } from "../context/types.t"

/**
 * Функция для создания декларации реакций
 * @param update Функция для обновления контекста
 * @returns Декларация реакций
 */
export type ReactionsDeclaration<C extends ContextSchema, S extends string, Core = Record<string, any>> = (
  update: Update<C>
) => ReactionDeclaration<C, S, Core>

/**
 * Карта реакций для быстрого поиска по состоянию.
 * Ключ — строка состояния, значение — массив реакций для этого состояния.
 */
export type ReactionsMap<C extends ContextSchema, S extends string, Core = Record<string, any>> = Map<
  S,
  Reaction<C, S, Core>[]
>

/**
 * Декларация реакций
 * @param C Контекст
 * @param S Состояние
 */
export type ReactionDeclaration<C extends ContextSchema, S extends string, Core = Record<string, any>> = [
  S[],
  {
    update: (args: { update: Update<C>; context: ExtractValues<C>; core: Core }) => void
    filter: (message: Message) => boolean
    title: string
  }
][]

export type ReactionActionArgs<C extends ContextSchema, S extends string, Core = Record<string, any>> = {
  id: string
  patch: JsonPatch
  meta: MetaDataMessage
  context: C
  core: Core
  update: (ctx: Partial<C>) => void
}

export type ReactionFilterArgs<C extends ContextSchema, S extends string> = {
  meta: MetaDataMessage
  patch: JsonPatch
  context: C
  state: S
}

export type Reaction<C extends ContextSchema, S extends string, Core = Record<string, any>> = {
  title: string
  filter: (args: ReactionFilterArgs<C, S>) => boolean
  update: (args: { update: Update<C>; context: ExtractValues<C>; core: Core }) => void
}
