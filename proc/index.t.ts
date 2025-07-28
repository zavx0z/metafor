import type { ContextSchema, ExtractValues, UpdateValues } from "../context"

/**
 * Тип билдера для декларации набора процессов автомата.
 *
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний/процессов
 * @param process - фабрика для создания цепочки ProcessChain
 * @returns объект, где ключи — имена процессов, а значения — цепочки ActionChain
 *
 * @example
 * const config = builder(process => ({
 *   foo: process({ title: "foo_process" }).action(...).success(...),
 *   bar: process().action(...)
 * }))
 */
export type ActionsDeclaration<C extends ContextSchema, S extends string> = (
  process: (config?: { title?: string; description?: string }) => ProcessChain<C>
) => Partial<Record<S, ActionChain<C, any>>>

/**
 * Chain API для создания процесса с опциональными параметрами title и description.
 * Позволяет удобно и строго типизировано описывать обработчики процессов автомата.
 *
 * @template C - схема контекста автомата
 * @template Res - возвращаемый тип результата action
 *
 * @example
 * const chain = process({ title: "my_process", description: "Описание процесса" })
 *   .action(({ context }) => ({ name: context.name }))
 *   .success(({ update, data }) => update({ name: data.name }))
 *   .error(({ update, error }) => update({ name: error.message }))
 *
 * chain.getResult() // { action, success, error, title?, description? }
 */
export type ProcessChain<C extends ContextSchema> = {
  /**
   * Добавляет основную функцию процесса.
   * @param fn - функция процесса, вызываемая автоматом
   * @returns цепочку для дальнейшего конфигурирования
   */
  action: <Res>(fn: (params: { context: ExtractValues<C> }) => Res | Promise<Res>) => ActionChain<C, Res>
}

/**
 * Цепочка для декларации action с типобезопасной поддержкой success и error.
 * Позволяет удобно и строго типизировано описывать обработчики процессов автомата.
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
   * Основная функция процесса, вызывается автоматом.
   * @param params - объект с текущим контекстом
   * @returns результат процесса (может быть промисом)
   */
  action: (params: { context: ExtractValues<C> }) => Res | Promise<Res>
  /**
   * Добавляет обработчик успешного завершения процесса.
   * @param handler - функция, вызываемая при успехе (получает update и data)
   * @returns цепочку для дальнейшего конфигурирования
   */
  success: (
    handler: (params: { update: (values: Partial<ExtractValues<C>>) => void; data: Res }) => void
  ) => ActionChain<C, Res>
  /**
   * Добавляет обработчик ошибки выполнения процесса.
   * @param handler - функция, вызываемая при ошибке (получает update и error типа Error)
   * @returns цепочку для дальнейшего конфигурирования
   */
  error: (
    handler: (params: { update: (values: Partial<ExtractValues<C>>) => void; error: Error }) => void
  ) => ActionChain<C, Res>
  /**
   * Возвращает итоговый объект конфигурации процесса для автомата.
   * @returns объект с action, success, error, title и description (если заданы)
   */
  getResult: () => Process<C, Res>
}

export type Process<C extends ContextSchema, Res = any> = {
  action: (params: { context: ExtractValues<C> }) => Res | Promise<Res>
  success?: (params: { update: (values: UpdateValues<ExtractValues<C>>) => void; data: Res }) => void
  error?: (params: { update: (values: UpdateValues<ExtractValues<C>>) => void; error: Error }) => void
  title?: string
  description?: string
}

/**
 * Конфигурация процессов автомата.
 * @template C - схема контекста автомата
 * @template Res - возвращаемый тип результата action
 * @returns объект с конфигурациями процессов
 */
export type ActionsConfig<C extends ContextSchema, S extends string, Res = any> = Partial<Record<S, Process<C, Res>>>
