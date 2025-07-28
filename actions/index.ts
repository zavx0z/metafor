import type { ContextSchema, ExtractValues } from "../context"
import type { ActionChain, ActionsDeclaration, Process, ProcessChain } from "./index.t"
export type { ActionsDeclaration, Process }

/**
 * Вспомогательная функция для декларации actionsConfig автомата через builder и chain API.
 * Гарантирует строгую типизацию и удобный API.
 *
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний/действий
 * @param builder - функция, принимающая process chain API и возвращающая объект действий
 * @returns объект actionsConfig для автомата (ключи — имена действий, значения — объекты с action, success, error, title, description)
 *
 * @example
 * const config = createActionsConfig((process) => ({
 *   anonymous: process({ title: "anonymous_action", description: "Действие для анонимного пользователя" })
 *     .action(({ context }) => ({ name: "User", age: 18 }))
 *     .success(({ update, data }) => update({ name: data.name }))
 *     .error(({ update, error }) => update({ name: error.message })),
 *   loading: process()
 *     .action(({ context }) => ({ name: context.name }))
 *     .error(({ update, error }) => update({ name: error.message })),
 * }))
 */
export function createActionsConfig<C extends ContextSchema, S extends string>(
  actions: ActionsDeclaration<C, S>
): Partial<Record<S, Process<C, any>>> {
  /**
   * Фабрика для создания process chain-объекта для каждого действия.
   * Каждый вызов process возвращает chain API с методами action, success, error, getResult.
   */
  function process(config?: { title?: string; description?: string }): ProcessChain<C> {
    return {
      action: <Res>(fn: (params: { context: ExtractValues<C> }) => Res | Promise<Res>): ActionChain<C, Res> => {
        // Храним текущие success/error handler'ы (последний вызов перезаписывает предыдущий)
        let successHandler:
          | ((params: { update: (values: Partial<ExtractValues<C>>) => void; data: Res }) => void)
          | undefined
        let errorHandler:
          | ((params: { update: (values: Partial<ExtractValues<C>>) => void; error: Error }) => void)
          | undefined
        // Chain API: каждый метод возвращает тот же объект, чтобы можно было строить цепочку
        const chain: ActionChain<C, Res> = {
          // Основная функция действия
          action: fn,
          // Добавляет/перезаписывает success handler
          success(handler) {
            successHandler = handler
            return chain
          },
          // Добавляет/перезаписывает error handler
          error(handler) {
            errorHandler = handler
            return chain
          },
          // Собирает итоговый объект: только те обработчики, которые были явно заданы
          getResult() {
            const result: Process<C, Res> = {
              action: fn,
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
  // Возвращаем actionsConfig: ключи — имена действий, значения — объекты с action, success, error, title, description
  return result
}

export { parseFunction, parseProcess } from "./parser"
