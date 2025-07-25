import type { Update, ExtractValues } from "../context/index.t"
import type { Message } from "../message"
import type { ContextSchema } from "../context/types.t"
// Тип для meta и patch можно уточнить при интеграции

export type ReactionActionArgs<C = any, Meta = any, Patch = any, Core = any> = {
  id: string
  patch: Patch
  meta: Meta
  context: C
  core: Core
  update: (ctx: Partial<C>) => void
}

export type ReactionFilterArgs<C = any, Meta = any, Patch = any> = {
  meta: Meta
  patch: Patch
  context: C
}

export type Reaction<C = any, Meta = any, Patch = any, Core = any> = {
  title: string
  filter: (args: ReactionFilterArgs<C, Meta, Patch>) => boolean
  action: (args: ReactionActionArgs<C, Meta, Patch, Core>) => void
}

// Ключ — массив состояний, значение — массив реакций
export type ReactionMap<C = any, Meta = any, Patch = any, Core = any> = Map<string[], Reaction<C, Meta, Patch, Core>[]>

export type ReactionDeclaration<C extends ContextSchema, S extends string> = [
  S[],
  {
    update?: (args: { update: Update<C>; context: ExtractValues<C>; core: Record<string, any> }) => void
    filter: (message: Message) => boolean
    title: string
  }
][]

export type ReactionsDeclaration<C extends ContextSchema, S extends string> = (
  update: Update<C>
) => ReactionDeclaration<C, S>
