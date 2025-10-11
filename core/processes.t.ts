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

import type { Schema, Values, Update } from "@zavx0z/context"
import type { Core } from "../actor.t"
import type { Self } from "../metafor.t"
export type Processes<C extends Schema = Schema, S extends string = string, I extends Core = Core> = {
  getProcess: (name: S) => Process<C, I> | undefined
  hasProcess: (name: S) => boolean
  getAllProcesses: () => Record<S, Process<C, I>>
  getProcessNames: () => string[]
}
/**
 * Chain API для создания процесса с опциональными параметрами label и desc.
 * Позволяет удобно и строго типизировано описывать обработчики процессов автомата.
 *
 * @template C - схема контекста автомата
 * @template Res - возвращаемый тип результата action
 *
 * @example
 * ```typescript
 * const chain = process({
 *   label: "my_process",
 *   desc: "Описание процесса"
 * })
 *   .action(({ context }) => ({ name: context.name }))
 *   .success(({ update, data }) => update({ name: data.name }))
 *   .error(({ update, error }) => update({ name: error.message }))
 *
 * chain.getResult() // { action, success, error, label?, desc? }
 * ```
 */
export type ProcessChain<C extends Schema, I extends Core> = {
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
export type ActionParams<C extends Schema, I extends Core> = {
  /** Контекст */
  context: Values<C>
  /** Ядро */
  core: I
  /** Схема контекста */
  schema: C
  /** Полный идентификатор актора с методом destroy */
  self: Self
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
 * const chain = action(({ context, core, schema, self }) => {
 *   // Доступ ко всем параметрам процесса
 *   // self.destroy() доступен в процессах
 *   return { name: context.name }
 * })
 *   .success(({ update, data }) => update({ name: data.name }))
 *   .error(({ update, error }) => update({ name: error.message }))
 *
 * chain.getResult() // { action, success, error }
 * ```
 */
export type ActionChain<C extends Schema, I extends Core, Res> = {
  /**
   * Основная функция процесса, вызывается автоматом.
   *
   * Получает полный набор параметров для выполнения процесса и должна вернуть результат или выбросить исключение.
   *
   * @param params - объект с параметрами процесса:
   *   - `context` - текущий контекст актора
   *   - `core` - ядро актора для сложных данных
   *   - `schema` - схема контекста для валидации и установки значений по умолчанию
   *   - `self` - полный идентификатор актора с методом destroy
   * @returns результат процесса (может быть промисом)
   *
   * @example
   * ```typescript
   * action: ({ context, core, schema, self }) => {
   *   // Доступ к контексту
   *   console.log(context.email, context.password)
   *
   *   // Доступ к ядру
   *   core.users.push({ name: context.name })
   *
   *   // Доступ к схеме для валидации
   *   const isValid = schema.email.validate(context.email)
   *
   *   // self.destroy() доступен для уничтожения актора
   *   // self.meta, self.actor, self.path доступны
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
  success: (handler: (params: { update: Update<C>; data: Res }) => void) => ActionChain<C, I, Res>

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
  error: (handler: (params: { update: Update<C>; error: Error }) => void) => ActionChain<C, I, Res>

  /**
   * Возвращает итоговый объект конфигурации процесса для автомата.
   *
   * Содержит все обработчики и метаданные процесса.
   *
   * @returns объект с action, success, error, label и desc (если заданы)
   *
   * @example
   * ```typescript
   * const processConfig = chain.getResult()
   * // {
   * //   action: Function,
   * //   success: Function,
   * //   error: Function,
   * //   label: "Авторизация",
   * //   desc: "Процесс входа пользователя"
   * // }
   * ```
   */
  getResult: () => Process<C, I, Res>
}

/**
 * Конфигурация одного процесса
 *
 * Содержит основную функцию action и опциональные обработчики success/error.
 * Также может содержать метаданные label и desc.
 *
 * @template C - схема контекста автомата
 * @template Res - возвращаемый тип результата action
 *
 * @example
 * ```typescript
 * const process: Process<MyContext, { userId: number }> = {
 *   label: "Авторизация",
 *   desc: "Процесс входа пользователя",
 *   action: async ({ context, core, schema, self }) => {
 *     // Логика авторизации с доступом ко всем параметрам
 *     // self.destroy() доступен для уничтожения актора
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
export type Process<C extends Schema = Schema, I extends Core = Core, Res = any> = {
  /** Основная функция процесса */
  action: (params: ActionParams<C, I>) => Res | Promise<Res>
  /** Обработчик успешного завершения */
  success?: (params: { update: Update<C>; data: Res }) => void
  /** Обработчик ошибки */
  error?: (params: { update: Update<C>; error: Error }) => void
  /** Название процесса для документации */
  label?: string
  /** Описание процесса для документации */
  desc?: string
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
 *     label: "Авторизация",
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
export type ProcessesType<C extends Schema, S extends string, I extends Core, Res = any> = Partial<
  Record<S, Process<C, I, Res>>
>
