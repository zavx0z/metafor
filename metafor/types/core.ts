import type {ContextData, ContextDefinition, Update} from "./context.ts"

export type CoreObj = Record<string, any>

export type CoreData<I extends CoreObj> = Partial<I>

/**
 * Данные ядра
 * @interface CoreDefinition
 * @template I - Внутренние данные
 * @template C - Контекст
 */
export type CoreDefinition<I extends CoreObj, C extends ContextDefinition> = (params: {
  update: Update<C>
  context: ContextData<C>
  self: Core<I>
}) => I

/**
 * Функционал ядра
 * @interface Core
 * @template I
 */
export type Core<I extends CoreObj> = {
  [K in keyof I]: I[K] extends (...args: infer Args) => infer R ? (...args: Args) => R : I[K]
}
