import type {ContextSchema, ExtractValues} from "../context"

/**
 * Тип функции для создания chain API действия автомата.
 * @template C - схема контекста
 * @template Res - тип результата действия
 * @param fn - функция действия, принимает { context }, возвращает результат или промис
 * @returns chain API с методами success и error
 */
export type ActionType<C extends ContextSchema> = <Res = any>(
  fn: (params: { context: ExtractValues<C> }) => Res | Promise<Res>
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
