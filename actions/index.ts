import type { ActionType, ActionSuccessHandler, ActionErrorHandler } from "./index.t"
import type { ContextSchema, ExtractValues } from "../context"

/**
 * Вспомогательная функция для создания actionsConfig через builder и chain API.
 * @param builder - функция, принимающая action chain API
 * @returns объект actionsConfig для автомата
 */

export function createActionsConfig<C extends ContextSchema, S extends string>(
  builder: (action: ActionType<C>) => Partial<
    Record<
      S,
      {
        action: (params: { context: ExtractValues<C> }) => any
        success?: ActionSuccessHandler<C, any>
        error?: ActionErrorHandler<C>
      }
    >
  >
) {
  function action<Res = any>(fn: (params: { context: ExtractValues<C> }) => Res | Promise<Res>) {
    let successHandler: ActionSuccessHandler<C, Res> | undefined
    let errorHandler: ActionErrorHandler<C> | undefined
    const chain = {
      action: fn,
      success(handler: ActionSuccessHandler<C, Res>) {
        successHandler = handler
        return chain
      },
      error(handler: ActionErrorHandler<C>) {
        errorHandler = handler
        return chain
      },
      getResult() {
        return {
          action: fn,
          success: successHandler,
          error: errorHandler,
        }
      },
    }
    return chain
  }
  // Собираем результат: вызываем getResult() для каждого состояния
  const raw = builder(action as any)
  const result: Partial<
    Record<S, { action: unknown; success?: ActionSuccessHandler<C, unknown>; error?: ActionErrorHandler<C> }>
  > = {}
  for (const key in raw) {
    if (raw[key]) {
      if (typeof (raw[key] as any).getResult === "function") {
        result[key] = (raw[key] as any).getResult()
      } else {
        result[key] = raw[key]
      }
    }
  }
  return result
}
