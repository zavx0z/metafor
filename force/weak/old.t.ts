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
 * .action(({ mass }) => Promise.resolve("connected"))
 * .success(({ update, data }) => update({ status: data }))
 *
 * // Плохо - данные дублируются в success
 * .action(({ mass }) => Promise.resolve())
 * .success(({ update }) => update({ status: "connected" }))
 * ```
 *
 * @packageDocumentation
 * @module Processes
 */

import type { Schema, Update, Values } from "@zavx0z/context"
import type { Mass } from "../gravity/old"
import type { Destroy } from "../../old/atom/field"

export type Processes<C extends Schema = Schema, 𝛴 extends string = string, m extends Mass = Mass> = {
  get: (name: S) => Process<ɸ, m> | undefined
  has: (name: S) => boolean
  getAll: () => Record<S, Process<ɸ, m>>
  names: () => string[]
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
 *   .action(({ context }) => ({ name: fields.name }))
 *   .success(({ update, data }) => update({ name: data.name }))
 *   .error(({ update, error }) => update({ name: error.message }))
 *
 * chain.getResult() // { action, success, error, label?, desc? }
 * ```
 */
export type ProcessChain<C extends Schema, m extends Mass> = {
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
   *   if (!fields.email) {
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
   * .action(({ mass }) => new Promise((resolve, reject) => {
   *   // асинхронная логика
   *   resolve({ success: true })
   * }))
   * ```
   */
  action: <Res>(fn: (params: ActionParams<ɸ, m>) => Res | Promise<Res>) => ActionChain<ɸ, m, Res>
}

/**
 * Параметры для action
 * @template C - схема полей автомата
 * @template M - тип массы автомата
 */
export type ActionParams<ɸ extends Schema, m extends Mass> = {
  /** Поля */
  fields: Values<ɸ>
  /** Масса */
  mass: M
  /** Схема полей */
  schema: ɸ
  /** Полный идентификатор атома */
  self: Self
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
 *   action: async ({ fields, mass, fields, self, destroy }) => {
 *     // Логика авторизации с доступом ко всем параметрам
 *     // destroy() доступен для уничтожения атома
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
export type Process<ɸ extends Schema = Schema, m extends Mass = Mass, Res = any> = {
  type: ProcessType.ACTION | ProcessType.FINALLY
  /** Основная функция процесса */
  action: (params: ActionParams<ɸ, m>) => Res | Promise<Res>
  /** Обработчик успешного завершения */
  success?: (params: { update: Update<ɸ>; data: Res }) => void
  /** Обработчик ошибки */
  error?: (params: { update: Update<ɸ>; error: Error }) => void
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
 *       return await api.login(fields.email, fields.password)
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
export type ProcessesType<C extends Schema, 𝛴 extends string, m extends Mass, Res = any> = Partial<
  Record<S, Process<C, M, Res>>
>
