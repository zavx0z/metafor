import type { ContextSchema, ExtractValues } from "../context"

/**
 * Цепочка для декларации action с типобезопасной поддержкой success и error.
 * Позволяет удобно и строго типизировано описывать обработчики действий автомата.
 *
 * @template C - схема контекста автомата
 * @template Res - возвращаемый тип результата action
 *
 * @example
 * const chain = action(({ context }) => ({ name: context.name }))
 *   .success(({ update, data }) => update({ name: data.name }))
 *   .error(({ update, error }) => update({ name: error.message }))
 *
 * chain.getResult() // { action, success, error }
 */
export type ActionChain<C extends ContextSchema, Res> = {
  /**
   * Основная функция действия, вызывается автоматом.
   * @param params - объект с текущим контекстом
   * @returns результат действия (может быть промисом)
   */
  action: (params: { context: ExtractValues<C> }) => Res | Promise<Res>
  /**
   * Добавляет обработчик успешного завершения действия.
   * @param handler - функция, вызываемая при успехе (получает update и data)
   * @returns цепочку для дальнейшего конфигурирования
   */
  success: (handler: (params: { update: any; data: Res }) => void) => ActionChain<C, Res>
  /**
   * Добавляет обработчик ошибки выполнения действия.
   * @param handler - функция, вызываемая при ошибке (получает update и error)
   * @returns цепочку для дальнейшего конфигурирования
   */
  error: (handler: (params: { update: any; error: any }) => void) => ActionChain<C, Res>
  /**
   * Возвращает итоговый объект конфигурации действия для автомата.
   * @returns объект с action, success и error (если заданы)
   */
  getResult: () => {
    action: (params: { context: ExtractValues<C> }) => Res | Promise<Res>
    success?: (params: { update: any; data: Res }) => void
    error?: (params: { update: any; error: any }) => void
  }
}

/**
 * Тип билдера для декларации набора действий автомата.
 *
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний/действий
 * @param action - фабрика для создания цепочки ActionChain
 * @returns объект, где ключи — имена действий, а значения — цепочки ActionChain
 *
 * @example
 * const config = builder(action => ({
 *   foo: action(...).success(...),
 *   bar: action(...)
 * }))
 */
export type Builder<C extends ContextSchema, S extends string> = (
  action: <Res>(fn: (params: { context: ExtractValues<C> }) => Res | Promise<Res>) => ActionChain<C, Res>
) => Record<S, ActionChain<C, any>>

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
      success(handler) {
        successHandler = handler
        return chain
      },
      error(handler) {
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
