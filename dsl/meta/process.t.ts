import type { Schema, Update, Values } from "@zavx0z/context"
import type { Mass, Self } from "./metafor.t"

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
 *   action: async ({ value, mass, schema, self, destroy }) => {
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
  /** Среды исполнения процесса */
  env?: ExecutionEnv[]
}

/**
 * Параметры для action
 * @template C - схема полей автомата
 * @template M - тип массы автомата
 */
export type ActionParams<ɸ extends Schema, m extends Mass> = {
  /** Текущие значения полей */
  value: Values<ɸ>
  /** Масса */
  mass: m
  /** Схема полей */
  schema: ɸ
  /** Полный идентификатор атома */
  self: Self
}

/**
 * Chain API для создания процесса с опциональными параметрами label и desc.
 * Позволяет удобно и строго типизировано описывать обработчики процессов автомата.
 *
 * @template ɸ - схема контекста автомата
 * @template Res - возвращаемый тип результата action
 *
 * @example
 * ```typescript
 * const chain = process({
 *   label: "my_process",
 *   desc: "Описание процесса"
 * })
 *   .action(({ value }) => ({ name: value.name }))
 *   .success(({ update, data }) => update({ name: data.name }))
 *   .error(({ update, error }) => update({ name: error.message }))
 *
 * chain.getResult() // { action, success, error, label?, desc? }
 * ```
 */
export type ProcessChain<ɸ extends Schema, m extends Mass> = {
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
   * .action(({ value }) => {
   *   if (!value.email) {
   *     throw new Error('Email обязателен')
   *   }
   *   return { isValid: true }
   * })
   *
   * // Асинхронная функция
   * .action(async ({ value }) => {
   *   const response = await fetch('/api/data', {
   *     method: 'POST',
   *     body: JSON.stringify(value)
   *   })
   *   return await response.json()
   * })
   *
   * // Предпочтительный формат action с Promise
   * .action(({ value, mass }) => new Promise((resolve, reject) => {
   *   // асинхронная логика
   *   resolve({ success: true })
   * }))
   * ```
   */
  action: <Res>(fn: (params: ActionParams<ɸ, m>) => Res | Promise<Res>) => ActionChain<ɸ, m, Res>
}

/**
 * Тип билдера для декларации набора процессов автомата.
 *
 * Позволяет создавать типизированные процессы с удобным API.
 *
 * @template ɸ - схема полей автомата
 * @template 𝛴 - строковые ключи состояний/процессов
 * @template m - тип mass объекта
 * @param process - фабрика для создания цепочки ProcessChain
 * @returns объект, где ключи — имена процессов, а значения — цепочки ActionChain
 */
export type ProcessesDeclaration<ɸ extends Schema = Schema, 𝛴 extends string = string, m extends Mass = Mass> = (
  process: (config?: ProcessConfig) => ProcessChain<ɸ, m>,
  destroy: (config?: DestroyConfig) => DestroyChain<ɸ, m>,
) => Partial<Record<𝛴, ActionChain<ɸ, m, any> | DestroyChain<ɸ, m>>>

/**
 * Обработчик действия процесса.
 * Содержит путь к модулю, имя экспорта и список полей контекста, которые читаются.
 */
export type ParsedActionHandler = {
  /** Путь к ESM-модулю с реализацией действия */
  src: string
  /** Имя экспорта для импорта (например, "default", "commit", "process") */
  importSpecifier?: string
  /** Список полей контекста, которые читаются в обработчике */
  read?: string[]
}

/**
 * Обработчик успеха или ошибки процесса.
 * Содержит функцию, список полей для чтения и записи.
 */
type ParsedHandler = {
  /** Список полей контекста, которые читаются в обработчике */
  read?: string[]
  /** Список полей контекста, которые записываются в обработчике */
  write?: string[]
  /** Строковое представление функции для десериализации */
  src: string
}
export enum ProcessType {
  ACTION = "action",
  FINALLY = "finally",
}
/**
 * Распарсенный процесс с обработчиками.
 * Содержит обработчики для действия, успеха и ошибки.
 */
export type ParsedProcess = {
  type: ProcessType.ACTION
  /** Название процесса */
  label?: string
  /** Описание процесса */
  desc?: string
  /** Среды исполнения процесса */
  env?: ExecutionEnv[]
  /** Обработчик основного действия процесса */
  action: ParsedActionHandler
  /** Обработчик успешного завершения процесса */
  success?: ParsedHandler
  /** Обработчик ошибки процесса */
  error?: ParsedHandler
}
/**
 * Распарсенный процесс с обработчиками.
 * Содержит обработчики для действия, успеха и ошибки.
 */
export type ParsedDestroy = {
  type: ProcessType.FINALLY
  /** Название процесса */
  label?: string
  /** Описание процесса */
  desc?: string
  /** Среды исполнения процесса */
  env?: ExecutionEnv[]
  before: ParsedActionHandler
}

/**
 * Схема процессов
 * Объект с распарсенными процессами
 */
export type ProcessesSchema = Record<string, ParsedProcess | ParsedDestroy>

interface BaseProcessConfig {
  /** Название*/
  label?: string
  /** Описание */
  desc?: string
}

/**
 * Среды исполнения для процесса.
 * Определяют, где может выполняться данный процесс.
 */
export type ExecutionEnv = "browser" | "node" | "worker" | "server" | "any"

export interface DestroyConfig extends BaseProcessConfig {
  /** Среды исполнения процесса */
  env?: ExecutionEnv[]
}

export interface ProcessConfig extends BaseProcessConfig {
  /**
   * Массив сред исполнения, в которых может выполняться процесс.
   * Позволяет указать целевую платформу для процесса.
   *
   * @example
   * ```typescript
   * // Процесс выполняется только в браузере
   * process({ env: ['browser'] })
   *
   * // Процесс выполняется в браузере и node
   * process({ env: ['browser', 'node'] })
   *
   * // Процесс выполняется в любой среде
   * process({ env: ['any'] })
   * ```
   */
  env?: ExecutionEnv[]
}

/**
 * Специальный тип для destroy-процессов
 */
export type DestroyChain<ɸ extends Schema = Schema, m extends Mass = Mass> = {
  before: (handler: ({ mass }: { mass: m }) => void | Promise<void>) => DestroyChain<ɸ, m>
}

/**
 * Цепочка для декларации action с типобезопасной поддержкой success и error.
 * Позволяет удобно и строго типизировано описывать обработчики процессов автомата.
 *
 * @template ɸ - схема полей автомата
 * @template Res - возвращаемый тип результата action
 *
 * @example
 * ```typescript
 * const chain = action(({ value, mass, schema, self, destroy }) => {
 *   // Доступ ко всем параметрам процесса
 *   // destroy() доступен в процессах
 *   return { name: value.name }
 * })
 *   .success(({ update, data }) => update({ name: data.name }))
 *   .error(({ update, error }) => update({ name: error.message }))
 *
 * chain.getResult() // { action, success, error }
 * ```
 */
export type ActionChain<ɸ extends Schema, m extends Mass, Res> = {
  /**
   * Основная функция процесса, вызывается автоматом.
   *
   * Получает полный набор параметров для выполнения процесса и должна вернуть результат или выбросить исключение.
   *
   * @param params - объект с параметрами процесса:
   *   - `value` - текущие значения полей атома
   *   - `mass` - масса атома для сложных данных и зависимостей от среды
   *   - `schema` - схема полей для валидации и установки значений по умолчанию
   *   - `self` - полный идентификатор атома
   *   - `destroy` - функция для уничтожения атома
   * @returns результат процесса (может быть промисом)
   *
   * @example
   * ```typescript
   * action: ({ value, mass, schema, self, destroy }) => {
   *   // Доступ к полям
   *   console.log(value.email, value.password)
   *
   *   // Доступ к массе
   *   mass.users.push({ name: value.name })
   *
   *   // Доступ к схеме для валидации
   *   const isValid = schema.email.validate(value.email)
   *
   *   // destroy() доступен для уничтожения атома
   *   // self.meta, self.atom, self.path доступны
   *
   *   // Возврат результата
   *   return { userId: 123, token: "abc" }
   * }
   * ```
   */
  action: (params: ActionParams<ɸ, m>) => Res | Promise<Res>

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
  success: (handler: (params: { update: Update<ɸ>; data: Res }) => void) => ActionChain<ɸ, m, Res>

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
  error: (handler: (params: { update: Update<ɸ>; error: Error }) => void) => ActionChain<ɸ, m, Res>

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
  getResult: () => Process<ɸ, m, Res>
}
