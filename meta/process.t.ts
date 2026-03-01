import type { Schema, Update } from "@zavx0z/context"
import type { Mass } from "../atom/gravity.t"
import type { ProcessChain, ActionParams, Process } from "../atom/src/processes.t"

/**
 * Тип билдера для декларации набора процессов автомата.
 *
 * Позволяет создавать типизированные процессы с удобным API.
 *
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний/процессов
 * @param process - фабрика для создания цепочки ProcessChain
 * @returns объект, где ключи — имена процессов, а значения — цепочки ActionChain
 */
export type ProcessesDeclaration<C extends Schema = Schema, 𝛴 extends string = string, m extends Mass = Mass> = (
  process: (config?: ProcessConfig) => ProcessChain<ɸ, m>,
  destroy: (config?: DestroyConfig) => DestroyChain<ɸ, m>
) => Partial<Record<S, ActionChain<ɸ, m, any> | DestroyChain<ɸ, m>>>

/**
 * Обработчик действия процесса.
 * Содержит функцию и список полей контекста, которые читаются.
 */
type ParsedActionHandler = {
  /** Список полей контекста, которые читаются в обработчике */
  read?: string[]
  /** Строковое представление функции action для десериализации */
  src: string
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

export interface DestroyConfig extends BaseProcessConfig {}

export interface ProcessConfig extends BaseProcessConfig {}

/**
 * Специальный тип для destroy-процессов
 */
export type DestroyChain<C extends Schema = Schema, m extends Mass = Mass> = {
  before: (handler: ({ mass }: { mass: I }) => void | Promise<void>) => DestroyChain<ɸ, m>
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
 * const chain = action(({ fields, mass, fields, self, destroy }) => {
 *   // Доступ ко всем параметрам процесса
 *   // destroy() доступен в процессах
 *   return { name: fields.name }
 * })
 *   .success(({ update, data }) => update({ name: data.name }))
 *   .error(({ update, error }) => update({ name: error.message }))
 *
 * chain.getResult() // { action, success, error }
 * ```
 */
export type ActionChain<C extends Schema, m extends Mass, Res> = {
  /**
   * Основная функция процесса, вызывается автоматом.
   *
   * Получает полный набор параметров для выполнения процесса и должна вернуть результат или выбросить исключение.
   *
   * @param params - объект с параметрами процесса:
   *   - `context` - текущий контекст атома
   *   - `mass` - масса атома для сложных данных и зависимостей от среды
   *   - `fields` - схема контекста для валидации и установки значений по умолчанию
   *   - `self` - полный идентификатор атома
   *   - `destroy` - функция для уничтожения атома
   * @returns результат процесса (может быть промисом)
   *
   * @example
   * ```typescript
   * action: ({ fields, mass, fields, self, destroy }) => {
   *   // Доступ к контексту
   *   console.log(fields.email, fields.password)
   *
   *   // Доступ к массе
   *   mass.users.push({ name: fields.name })
   *
   *   // Доступ к схеме для валидации
   *   const isValid = fields.email.validate(fields.email)
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
  getResult: () => Process<C, M, Res>
}
