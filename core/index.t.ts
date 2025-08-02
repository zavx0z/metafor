/**
 * Основные типы MetaFor
 * @packageDocumentation
 * @module Core
 */
import type { ContextSchema, ExtractValues, SerializedSchema } from "./context"
import type { ProcessesConfig } from "./proc/index.t"
import type { ReactionRegistry } from "./react"
import type { StatesConfig } from "./state"
import type { ViewConfig } from "./view/index.t"

/**
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний
 */

export interface Snapshot<C extends ContextSchema, S extends string> {
  state: S
  states: StatesConfig<S, C>
  context: ExtractValues<C>
  schema: SerializedSchema<C>
  /** Сериализованный view как строка template literal */
  view?: string
}

/**
 *  Ядро компонента
 */
export type Core = Record<string, any>

/**
 * @internal
 * @description
 * Тип параметров для создания web-компонента-актора конечного автомата (Actor)
 */
export type CreateMetaForParams<C extends ContextSchema, S extends string, I extends Core> = {
  tag: string
  env: "server" | "browser"
  schema: C
  states: StatesConfig<S, C>
  core: I
  processes: ProcessesConfig<C, S, I>
  reactions: ReactionRegistry<C, S>
  view: ViewConfig<C, S, I> | undefined
}
