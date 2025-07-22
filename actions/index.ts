import type { ContextSchema, ExtractValues } from "../context"
import type { ActionChain, Builder } from "./index.t"

/**
 * Вспомогательная функция для декларации actionsConfig автомата через builder и chain API.
 * Гарантирует строгую типизацию и удобный API.
 *
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний/действий
 * @param builder - функция, принимающая action chain API и возвращающая объект действий
 * @returns объект actionsConfig для автомата (ключи — имена действий, значения — объекты с action, success, error)
 *
 * @example
 * const config = createActionsConfig((action) => ({
 *   anonymous: action(({ context }) => ({ name: "User", age: 18 }))
 *     .success(({ update, data }) => update({ name: data.name }))
 *     .error(({ update, error }) => update({ name: error.message })),
 *   loading: action(({ context }) => ({ name: context.name }))
 *     .error(({ update, error }) => update({ name: error.message })),
 * }))
 */
export function createActionsConfig<C extends ContextSchema, S extends string>(builder: Builder<C, S>) {
  function action<Res>(fn: (params: { context: ExtractValues<C> }) => Res | Promise<Res>): ActionChain<C, Res> {
    let successHandler: ((params: { update: any; data: Res }) => void) | undefined
    let errorHandler: ((params: { update: any; error: any }) => void) | undefined
    const chain: ActionChain<C, Res> = {
      action: fn,
      success(handler: (params: { update: any; data: Res }) => void) {
        successHandler = handler
        return chain
      },
      error(handler: (params: { update: any; error: any }) => void) {
        errorHandler = handler
        return chain
      },
      getResult() {
        const result: {
          action: (params: { context: ExtractValues<C> }) => Res | Promise<Res>
          success?: (params: { update: any; data: Res }) => void
          error?: (params: { update: any; error: any }) => void
        } = {
          action: fn,
        }
        if (successHandler) result.success = successHandler
        if (errorHandler) result.error = errorHandler
        return result
      },
    }
    return chain
  }
  const raw = builder(action)
  const result: Record<S, ReturnType<ActionChain<C, any>["getResult"]>> = {} as any
  for (const key in raw) {
    result[key] = raw[key].getResult()
  }
  return result
}
