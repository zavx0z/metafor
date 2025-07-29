/**
 * Реализация процессов
 * @module Processes
 */

import type { ContextSchema, ExtractValues } from "../context"
import type { ActionChain, ActionsDeclaration, Process, ProcessChain } from "./index.t"
import type { Core } from "../metafor.t"

/**
 * Вспомогательная функция для декларации actionsConfig автомата через builder и chain API.
 * Гарантирует строгую типизацию и удобный API.
 *
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний/процессов
 * @param actions - функция, принимающая process chain API и возвращающая объект процессов
 * @returns объект actionsConfig для автомата (ключи — имена процессов, значения — объекты с action, success, error, title, description)
 *
 * @example
 * const config = createActionsConfig((process) => ({
 *   anonymous: process({ title: "anonymous_process", description: "Процесс для анонимного пользователя" })
 *     .action(({ context }) => ({ name: "User", age: 18 }))
 *     .success(({ update, data }) => update({ name: data.name }))
 *     .error(({ update, error }) => update({ name: error.message })),
 *   loading: process()
 *     .action(({ context }) => ({ name: context.name }))
 *     .error(({ update, error }) => update({ name: error.message })),
 * }))
 */
export function createActionsConfig<C extends ContextSchema, S extends string, I extends Core = {}>(
  actions: ActionsDeclaration<C, S, I>
): Partial<Record<S, Process<C, any>>> {
  /**
   * Фабрика для создания process chain-объекта для каждого процесса.
   * Каждый вызов process возвращает chain API с методами action, success, error, getResult.
   */
  function process(config?: { title?: string; description?: string }): ProcessChain<C, I> {
    return {
      action: <Res>(fn: (params: { context: ExtractValues<C>; core: I }) => Res | Promise<Res>): ActionChain<C, I, Res> => {
        // Храним текущие success/error handler'ы (последний вызов перезаписывает предыдущий)
        let successHandler:
          | ((params: { update: (values: Partial<ExtractValues<C>>) => void; data: Res }) => void)
          | undefined
        let errorHandler:
          | ((params: { update: (values: Partial<ExtractValues<C>>) => void; error: Error }) => void)
          | undefined
        // Chain API: каждый метод возвращает тот же объект, чтобы можно было строить цепочку
        const chain: ActionChain<C, I, Res> = {
          // Основная функция процесса
          action: fn,
          // Добавляет/перезаписывает success handler
          success(handler: (params: { update: (values: Partial<ExtractValues<C>>) => void; data: Res }) => void) {
            successHandler = handler
            return chain
          },
          // Добавляет/перезаписывает error handler
          error(handler: (params: { update: (values: Partial<ExtractValues<C>>) => void; error: Error }) => void) {
            errorHandler = handler
            return chain
          },
          // Собирает итоговый объект: только те обработчики, которые были явно заданы
          getResult() {
            const result: Process<C, Res> = {
              action: (params) => fn({ context: params.context, core: {} as I }),
            }
            if (successHandler) result.success = successHandler
            if (errorHandler) result.error = errorHandler
            if (config?.title) result.title = config.title
            if (config?.description) result.description = config.description
            return result
          },
        }
        return chain
      },
    }
  }
  // Вызываем builder, передавая фабрику process. На выходе получаем объект, где значения — chain-объекты.
  const raw = actions(process)
  // Для каждого ключа вызываем getResult, чтобы получить финальный объект с action, success, error, title, description.
  const result: Partial<Record<S, Process<C, any>>> = {} as any
  for (const key in raw) {
    if (raw[key]) {
      result[key] = raw[key]!.getResult()
    }
  }
  // Возвращаем actionsConfig: ключи — имена процессов, значения — объекты с action, success, error, title, description
  return result
}
