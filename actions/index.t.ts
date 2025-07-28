import type { ContextSchema, ExtractValues, UpdateValues } from "../context"

/**
 * Тип билдера для декларации набора действий автомата.
 *
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний/действий
 * @param process - фабрика для создания цепочки ProcessChain
 * @returns объект, где ключи — имена действий, а значения — цепочки ActionChain
 *
 * @example
 * const config = builder(process => ({
 *   foo: process({ title: "foo_action" }).action(...).success(...),
 *   bar: process().action(...)
 * }))
 */
export type ActionsDeclaration<C extends ContextSchema, S extends string> = (
  process: (config?: { title?: string; description?: string }) => ProcessChain<C>
) => Partial<Record<S, ActionChain<C, any>>>

/**
 * Chain API для создания процесса с опциональными параметрами title и description.
 * Позволяет удобно и строго типизировано описывать обработчики действий автомата.
 *
 * @template C - схема контекста автомата
 * @template Res - возвращаемый тип результата action
 *
 * @example
 * const chain = process({ title: "my_action", description: "Описание действия" })
 *   .action(({ context }) => ({ name: context.name }))
 *   .success(({ update, data }) => update({ name: data.name }))
 *   .error(({ update, error }) => update({ name: error.message }))
 *
 * chain.getResult() // { action, success, error, title?, description? }
 */
export type ProcessChain<C extends ContextSchema> = {
  /**
   * Добавляет основную функцию действия.
   * @param fn - функция действия, вызываемая автоматом
   * @returns цепочку для дальнейшего конфигурирования
   */
  action: <Res>(fn: (params: { context: ExtractValues<C> }) => Res | Promise<Res>) => ActionChain<C, Res>
}

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
  success: (
    handler: (params: { update: (values: Partial<ExtractValues<C>>) => void; data: Res }) => void
  ) => ActionChain<C, Res>
  /**
   * Добавляет обработчик ошибки выполнения действия.
   * @param handler - функция, вызываемая при ошибке (получает update и error типа Error)
   * @returns цепочку для дальнейшего конфигурирования
   */
  error: (
    handler: (params: { update: (values: Partial<ExtractValues<C>>) => void; error: Error }) => void
  ) => ActionChain<C, Res>
  /**
   * Возвращает итоговый объект конфигурации действия для автомата.
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
 * Конфигурация действий автомата.
 * @template C - схема контекста автомата
 * @template Res - возвращаемый тип результата action
 * @returns объект с конфигурациями действий
 */
export type ActionsConfig<C extends ContextSchema, S extends string, Res = any> = Partial<Record<S, Process<C, Res>>>
