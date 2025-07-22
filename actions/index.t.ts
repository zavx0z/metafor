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
 * Тип функции для создания chain API действия автомата.
 * @template C - схема контекста
 * @template Res - тип результата действия
 * @param action - функция действия, принимает { context }, возвращает результат или промис
 * @returns chain API с методами success и error
 */
export type ActionType<C extends ContextSchema> = <Res = any>(
  action: ActionHandler<C, Res>
) => {
  /**
   * Зарегистрировать обработчик успеха для действия
   * @param handler - функция, вызываемая при успешном завершении действия
   * @returns chain API с методами success и error
   */
  success: ActionSuccess<C, Res>
  /**
   * Зарегистрировать обработчик ошибки для действия
   * @param handler - функция, вызываемая при ошибке выполнения действия
   * @returns chain API с методами success и error
   */
  error: ActionError<C>
}

/**
 * Тип функции для создания chain API действия автомата.
 * @template C - схема контекста
 * @template Res - тип результата действия
 * @param action - функция действия, принимает { context }, возвращает результат или промис
 * @returns chain API с методами success и error
 */
export type ActionHandler<C extends ContextSchema, Res> = (params: { context: ExtractValues<C> }) => Res | Promise<Res>

/**
 * Обработчик успеха для действия автомата
 * @template C - схема контекста
 * @template Res - тип результата действия
 * @param params - объект с update (функция обновления контекста) и data (результат)
 */
export type ActionSuccessHandler<C extends ContextSchema, Res> = (params: {
  update: (values: Partial<ExtractValues<C>>) => void
  data: Res
}) => void

/**
 * Обработчик ошибки для действия автомата
 * @template C - схема контекста
 * @param params - объект с update (функция обновления контекста) и error (ошибка)
 */
export type ActionErrorHandler<C extends ContextSchema> = (params: {
  update: (values: Partial<ExtractValues<C>>) => void
  error: any
}) => void

/**
 * Метод chain API для регистрации обработчика успеха
 * @template C - схема контекста
 * @template Res - тип результата действия
 * @param handler - функция-обработчик успеха
 * @returns chain API с методами success и error
 */
export type ActionSuccess<C extends ContextSchema, Res> = (handler: ActionSuccessHandler<C, Res>) => {
  success: ActionSuccess<C, Res>
  error: ActionError<C>
}

/**
 * Метод chain API для регистрации обработчика ошибки
 * @template C - схема контекста
 * @param handler - функция-обработчик ошибки
 * @returns chain API с методами success и error
 */
export type ActionError<C extends ContextSchema> = (handler: ActionErrorHandler<C>) => {
  success: ActionSuccess<C, any>
  error: ActionError<C>
}
