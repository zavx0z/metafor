import type { ActionType, ActionSuccessHandler, ActionSuccess, ActionErrorHandler, ActionError } from "./index.t"
import type { ContextSchema, ExtractValues } from "../context"

/**
 * Вспомогательная функция для создания actionsConfig через builder и chain API.
 * @param builder - функция, принимающая action chain API
 * @returns объект actionsConfig для автомата
 */

export function createActionsConfig<C extends ContextSchema, S extends string>(
  builder: (action: ActionType<C>) => Partial<Record<S, ReturnType<ActionType<C>>>>
) {
  function action<Res = any>(fn: (params: { context: ExtractValues<C> }) => Res | Promise<Res>) {
    function success(handler: ActionSuccessHandler<C, Res>): ReturnType<ActionSuccess<C, Res>> {
      chain.successHandler = handler
      return chainApi
    }
    function error(handler: ActionErrorHandler<C>): ReturnType<ActionError<C>> {
      chain.errorHandler = handler
      return chainApi
    }
    const chainApi = {
      action: fn,
      success,
      error,
    }
    const chain: any = {
      ...chainApi,
      successHandler: undefined,
      errorHandler: undefined,
    }
    return chainApi
  }
  return builder(action)
}
