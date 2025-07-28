/**
 * Типы для процессов (Processes)
 * @packageDocumentation
 * 
 * # Процессы (Processes)
 * 
 * Процессы — это действия с обработкой успеха и ошибок. Они могут быть как асинхронными, так и синхронными.
 * Процессы позволяют инкапсулировать бизнес-логику и обрабатывать результаты выполнения.
 * 
 * ## Основные принципы:
 * - **Асинхронность**: Процессы могут быть асинхронными (API вызовы) или синхронными (валидация)
 * - **Обработка результатов**: Всегда обрабатывайте успех и ошибки
 * - **Типобезопасность**: TypeScript проверяет типы входных и выходных данных
 * - **Цепочка методов**: Используйте chain API для удобного конфигурирования
 * 
 * ## Структура процесса:
 * ```typescript
 * .processes((process) => ({
 *   processName: process(config?)
 *     .action(fn)
 *     .success(handler)
 *     .error(handler)
 * }))
 * ```
 * 
 * @example
 * ```typescript
 * .processes((process) => ({
 *   // Асинхронный процесс
 *   login: process({
 *     title: "Авторизация",
 *     description: "Процесс входа пользователя"
 *   })
 *     .action(async ({ context }) => {
 *       const response = await fetch('/api/login', {
 *         method: 'POST',
 *         body: JSON.stringify({
 *           email: context.email,
 *           password: context.password
 *         })
 *       })
 *       
 *       if (!response.ok) {
 *         throw new Error('Ошибка авторизации')
 *       }
 *       
 *       return await response.json()
 *     })
 *     .success(({ update, data }) => {
 *       update({
 *         isAuthenticated: true,
 *         user: data.user,
 *         error: ""
 *       })
 *     })
 *     .error(({ update, error }) => {
 *       update({
 *         error: error.message,
 *         isAuthenticated: false
 *       })
 *     }),
 *   
 *   // Синхронный процесс
 *   validateForm: process()
 *     .action(({ context }) => {
 *       const errors = []
 *       
 *       if (!context.email) {
 *         errors.push('Email обязателен')
 *       }
 *       
 *       if (!context.password) {
 *         errors.push('Пароль обязателен')
 *       }
 *       
 *       if (errors.length > 0) {
 *         throw new Error(errors.join(', '))
 *       }
 *       
 *       return { isValid: true }
 *     })
 *     .success(({ update }) => {
 *       update({ isValid: true, errors: [] })
 *     })
 *     .error(({ update, error }) => {
 *       update({ 
 *         isValid: false, 
 *         errors: error.message.split(', ') 
 *       })
 *     })
 * }))
 * ```
 */

import type { ContextSchema, ExtractValues, UpdateValues } from "../context"

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
export type ProcessChain<C extends ContextSchema> = {
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
   * ```
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
 * ```typescript
 * const chain = action(({ context }) => ({ name: context.name }))
 *   .success(({ update, data }) => update({ name: data.name }))
 *   .error(({ update, error }) => update({ name: error.message }))
 *
 * chain.getResult() // { action, success, error }
 * ```
 */
export type ActionChain<C extends ContextSchema, Res> = {
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
  action: (params: { context: ExtractValues<C> }) => Res | Promise<Res>
  
  /**
   * Добавляет обработчик успешного завершения процесса.
   * 
   * Вызывается когда action завершился успешно (не выбросил исключение).
   * Получает функцию update для изменения контекста и данные от action.
   * 
   * @param handler - функция, вызываемая при успехе (получает update и data)
   * @returns цепочку для дальнейшего конфигурирования
   * 
   * @example
   * ```typescript
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
  ) => ActionChain<C, Res>
  
  /**
   * Добавляет обработчик ошибки выполнения процесса.
   * 
   * Вызывается когда action выбросил исключение.
   * Получает функцию update для изменения контекста и объект ошибки.
   * 
   * @param handler - функция, вызываемая при ошибке (получает update и error типа Error)
   * @returns цепочку для дальнейшего конфигурирования
   * 
   * @example
   * ```typescript
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
  ) => ActionChain<C, Res>
  
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
  getResult: () => Process<C, Res>
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
export type Process<C extends ContextSchema, Res = any> = {
  /** Основная функция процесса */
  action: (params: { context: ExtractValues<C> }) => Res | Promise<Res>
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
 * Конфигурация процессов автомата.
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
export type ActionsConfig<C extends ContextSchema, S extends string, Res = any> = Partial<Record<S, Process<C, Res>>>
