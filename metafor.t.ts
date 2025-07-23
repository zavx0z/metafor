import type { ContextSchema, ExtractValues, SerializedSchema } from "./context"
import type { ActionsConfig } from "./actions/index.t"
import type { StatesConfig } from "./machine/index.t"

/**
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний
 */
export interface Snapshot<C extends ContextSchema, S extends string> {
  state: S
  states: StatesConfig<S, C>
  context: ExtractValues<C>
  schema: SerializedSchema<C>
  // actions: ActionsConfig<C, S>
}
