/**
 * Типы для процессов
 *
 * **ВАЖНО: Все процессы должны иметь обработчики success и error**
 * Используйте reject для ошибок, а не resolve({ success: false })
 * Обработчики обеспечивают полную обработку всех результатов Promise
 *
 * **Предпочтительно передавать данные через action для обновления контекста:**
 * ```typescript
 * // Хорошо - данные передаются через action
 * .action(({ core }) => Promise.resolve("connected"))
 * .success(({ update, data }) => update({ status: data }))
 *
 * // Плохо - данные дублируются в success
 * .action(({ core }) => Promise.resolve())
 * .success(({ update }) => update({ status: "connected" }))
 * ```
 *
 * @packageDocumentation
 * @module Processes
 */

import type { ContextSchema, ExtractValues, UpdateValues } from "../context"
import type { Core } from "../../core/index.t"

export type ProcessConfig = {
  /** Название*/
  title?: string
  /** Описание */
  description?: string
}

/**
 * Тип билдера для декларации набора процессов автомата.
 *
 * Позволяет создавать типизированные процессы с удобным API.
 *
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний/процессов
 * @param process - фабрика для создания цепочки ProcessChain
 * @returns объект, где ключи — имена процессов, а значения — цепочки ActionChain
 *
 * @includeExample ./proc/test/actions.basic.spec.ts
 * @includeExample ./proc/test/actions.types.spec.ts
 */
export type ProcessesDeclaration<C extends ContextSchema, S extends string, I extends Core> = (
  process: (config?: ProcessConfig) => ProcessChain<C, I>
) => Partial<Record<S, ActionChain<C, I, any>>>

/**
 * Chain API для создания процесса с опциональными параметрами title и description.
 * Позволяет удобно и строго типизировано описывать обработчики процессов автомата.
 *
 * @template C - схема контекста автомата
 * @template Res - возвращаемый тип результата action
 *
 * @example
 * ```typescript
 * const chain = process({
 *   title: "my_process",
 *   description: "Описание процесса"
 * })
 *   .action(({ context }) => ({ name: context.name }))
 *   .success(({ update, data }) => update({ name: data.name }))
 *   .error(({ update, error }) => update({ name: error.message }))
 *
 * chain.getResult() // { action, success, error, title?, description? }
 * ```
 */
export type ProcessChain<C extends ContextSchema, I extends Core> = {
  /**
   * Добавляет основную функцию процесса.
   *
   * Функция может быть как синхронной, так и асинхронной.
   * При выбросе исключения вызывается обработчик error.
   * При успешном выполнении вызывается обработчик success.
   *
   * @param fn - функция процесса, вызываемая автоматом
   * @returns цепочку для дальнейшего конфигурирования
   *
   * @example
   * ```typescript
   * // Синхронная функция
   * .action(({ context }) => {
   *   if (!context.email) {
   *     throw new Error('Email обязателен')
   *   }
   *   return { isValid: true }
   * })
   *
   * // Асинхронная функция
   * .action(async ({ context }) => {
   *   const response = await fetch('/api/data', {
   *     method: 'POST',
   *     body: JSON.stringify(context)
   *   })
   *   return await response.json()
   * })
   *
   * // Предпочтительный формат action с Promise
   * .action(({ core }) => new Promise((resolve, reject) => {
   *   // асинхронная логика
   *   resolve({ success: true })
   * }))
   * ```
   */
  action: <Res>(fn: (params: ActionParams<C, I>) => Res | Promise<Res>) => ActionChain<C, I, Res>
}

/**
 * Параметры для action
 * @template C - схема контекста автомата
 * @template I - тип ядра автомата
 */
export type ActionParams<C extends ContextSchema, I extends Core> = {
  /** Контекст */
  context: ExtractValues<C>
  /** Ядро */
  core: I
  /** Элемент */
  element: HTMLElement
}

/**
 * Цепочка для декларации action с типобезопасной поддержкой success и error.
 * Позволяет удобно и строго типизировано описывать обработчики процессов автомата.
 *
 * @template C - схема контекста автомата
 * @template Res - возвращаемый тип результата action
 *
 * @example
 * ```typescript
 * const chain = action(({ context }) => ({ name: context.name }))
 *   .success(({ update, data }) => update({ name: data.name }))
 *   .error(({ update, error }) => update({ name: error.message }))
 *
 * chain.getResult() // { action, success, error }
 * ```
 */
export type ActionChain<C extends ContextSchema, I extends Core, Res> = {
  /**
   * Основная функция процесса, вызывается автоматом.
   *
   * Получает текущий контекст и должна вернуть результат или выбросить исключение.
   *
   * @param params - объект с текущим контекстом
   * @returns результат процесса (может быть промисом)
   *
   * @example
   * ```typescript
   * action: ({ context }) => {
   *   // Доступ к контексту
   *   console.log(context.email, context.password)
   *
   *   // Возврат результата
   *   return { userId: 123, token: "abc" }
   * }
   * ```
   */
  action: (params: ActionParams<C, I>) => Res | Promise<Res>

  /**
   * Добавляет обработчик успешного завершения процесса.
   *
   * Вызывается когда action завершился успешно (не выбросил исключение).
   * Получает функцию update для изменения контекста и данные от action.
   *
   * **ВАЖНО: success обработчик должен быть синхронным.**
   * Асинхронные операции выполняйте только в action функциях.
   * Для последовательных асинхронных операций создавайте отдельные процессы.
   *
   * @param handler - функция, вызываемая при успехе (получает update и data)
   * @returns цепочку для дальнейшего конфигурирования
   *
   * @example
   * ```typescript
   * // Предпочтительный формат success/error
   * .success(({ update, data }) => update({ status: data.status }))
   * .error(({ update, error }) => update({ status: "error", error: error.message }))
   *
   * // Расширенный формат
   * .success(({ update, data }) => {
   *   // Обновляем контекст данными от action
   *   update({
   *     userId: data.userId,
   *     token: data.token,
   *     isAuthenticated: true,
   *     error: ""
   *   })
   * })
   * ```
   */
  success: (
    handler: (params: { update: (values: Partial<ExtractValues<C>>) => void; data: Res }) => void
  ) => ActionChain<C, I, Res>

  /**
   * Добавляет обработчик ошибки выполнения процесса.
   *
   * Вызывается когда action выбросил исключение.
   * Получает функцию update для изменения контекста и объект ошибки.
   *
   * **ВАЖНО: error обработчик должен быть синхронным.**
   * Асинхронные операции выполняйте только в action функциях.
   * Для последовательных асинхронных операций создавайте отдельные процессы.
   *
   * @param handler - функция, вызываемая при ошибке (получает update и error типа Error)
   * @returns цепочку для дальнейшего конфигурирования
   *
   * @example
   * ```typescript
   * // Предпочтительный формат success/error
   * .success(({ update, data }) => update({ status: data.status }))
   * .error(({ update, error }) => update({ status: "error", error: error.message }))
   *
   * // Расширенный формат
   * .error(({ update, error }) => {
   *   // Обрабатываем ошибку
   *   update({
   *     error: error.message,
   *     isAuthenticated: false,
   *     isLoading: false
   *   })
   * })
   * ```
   */
  error: (
    handler: (params: { update: (values: Partial<ExtractValues<C>>) => void; error: Error }) => void
  ) => ActionChain<C, I, Res>

  /**
   * Возвращает итоговый объект конфигурации процесса для автомата.
   *
   * Содержит все обработчики и метаданные процесса.
   *
   * @returns объект с action, success, error, title и description (если заданы)
   *
   * @example
   * ```typescript
   * const processConfig = chain.getResult()
   * // {
   * //   action: Function,
   * //   success: Function,
   * //   error: Function,
   * //   title: "Авторизация",
   * //   description: "Процесс входа пользователя"
   * // }
   * ```
   */
  getResult: () => Process<C, I, Res>
}

/**
 * Конфигурация одного процесса
 *
 * Содержит основную функцию action и опциональные обработчики success/error.
 * Также может содержать метаданные title и description.
 *
 * @template C - схема контекста автомата
 * @template Res - возвращаемый тип результата action
 *
 * @example
 * ```typescript
 * const process: Process<MyContext, { userId: number }> = {
 *   title: "Авторизация",
 *   description: "Процесс входа пользователя",
 *   action: async ({ context }) => {
 *     // Логика авторизации
 *     return { userId: 123 }
 *   },
 *   success: ({ update, data }) => {
 *     update({ userId: data.userId, isAuthenticated: true })
 *   },
 *   error: ({ update, error }) => {
 *     update({ error: error.message })
 *   }
 * }
 * ```
 */
export type Process<C extends ContextSchema, I extends Core, Res = any> = {
  /** Основная функция процесса */
  action: (params: ActionParams<C, I>) => Res | Promise<Res>
  /** Обработчик успешного завершения */
  success?: (params: { update: (values: UpdateValues<ExtractValues<C>>) => void; data: Res }) => void
  /** Обработчик ошибки */
  error?: (params: { update: (values: UpdateValues<ExtractValues<C>>) => void; error: Error }) => void
  /** Название процесса для документации */
  title?: string
  /** Описание процесса для документации */
  description?: string
}

/**
 * Процессы.
 *
 * Объект, где ключи - имена процессов, а значения - их конфигурации.
 *
 * @template C - схема контекста автомата
 * @template S - строковые ключи процессов
 * @template Res - возвращаемый тип результата action
 *
 * @example
 * ```typescript
 * const config: ActionsConfig<MyContext, "login" | "logout"> = {
 *   login: {
 *     title: "Авторизация",
 *     action: async ({ context }) => {
 *       return await api.login(context.email, context.password)
 *     },
 *     success: ({ update, data }) => {
 *       update({ user: data.user, isAuthenticated: true })
 *     },
 *     error: ({ update, error }) => {
 *       update({ error: error.message })
 *     }
 *   },
 *   logout: {
 *     action: () => {
 *       localStorage.removeItem('token')
 *       return { success: true }
 *     },
 *     success: ({ update }) => {
 *       update({ user: null, isAuthenticated: false })
 *     }
 *   }
 * }
 * ```
 */
export type Processes<C extends ContextSchema, S extends string, I extends Core, Res = any> = Partial<
  Record<S, Process<C, I, Res>>
>
