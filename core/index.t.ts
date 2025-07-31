/**
 * Основные типы MetaFor
 * @packageDocumentation
 * @module Core
 */
import type { ContextSchema, ExtractValues, SerializedSchema } from "./context"
import type { StatesConfig } from "./state"

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
