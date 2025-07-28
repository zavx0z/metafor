import type { Update, ExtractValues } from "../context/index.t"
import type { JsonPatch, MetaDataMessage } from "../message"
import type { ContextSchema } from "../context/types.t"

/**
 * Chain API для создания реакций
 */
export type ReactionsChain<C extends ContextSchema, S extends string, Core = Record<string, any>> = (
  reaction: ReactionChain<C, S, Core>
) => any[]

/**
 * Chain API для создания реакции
 */
export type ReactionChain<C extends ContextSchema, S extends string, Core = Record<string, any>> = (
  config: { title: string; description?: string }
) => {
  filter: (filterFn: (args: ReactionFilterArgs<C, S>) => boolean) => {
    equal: (updateFn: ReactionUpdate<C, S, Core>) => {
      filter: (args: ReactionFilterArgs<C, S>) => boolean
      update: ReactionUpdate<C, S, Core>
      title: string
      description?: string
    }
  }
}

/**
 * Карта реакций для быстрого поиска по состоянию.
 * Ключ — строка состояния, значение — массив реакций для этого состояния.
 */
export type ReactionsMap<C extends ContextSchema, S extends string, Core = Record<string, any>> = Map<
  S,
  Reaction<C, S, Core>[]
>

export type ReactionUpdate<C extends ContextSchema, S extends string, Core = Record<string, any>> = ({
  patch,
  meta,
  context,
  state,
  core,
}: {
  patch: JsonPatch
  meta: MetaDataMessage
  context: ExtractValues<C>
  state: S
  core: Core
  update: Update<C>
}) => void

export type ReactionFilterArgs<C extends ContextSchema, S extends string> = {
  meta: MetaDataMessage
  patch: JsonPatch
  context: ExtractValues<C>
  state: S
}

export type Reaction<C extends ContextSchema, S extends string, Core = Record<string, any>> = {
  title: string
  filter: (args: ReactionFilterArgs<C, S>) => boolean
  update: ReactionUpdate<C, S, Core>
}
