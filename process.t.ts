import type { Fields, Update, Values } from "./fields.t.ts"
import type { ActionParams } from "./action.t.ts"
import type { Mass } from "./metafor.t.ts"
import type { DestroyChain, DestroyConfig, ParsedDestroy } from "./finally.t.ts"
import type { SuperpositionProcessValue } from "./superposition.t.ts"

declare const ProcessStateBrand: unique symbol

type ProcessStateMarker<s extends string> = {
  readonly [ProcessStateBrand]?: s
}

type ProcessFactory<
  ɸ extends Fields,
  𝛴 extends string,
  m extends Mass,
  ψ,
> = {
  <S extends 𝛴>(state: S, config?: ProcessConfig): ProcessChain<ɸ, m, SuperpositionProcessValue<ɸ, ψ, S>, S>
}

type DestroyFactory<
  ɸ extends Fields,
  𝛴 extends string,
  m extends Mass,
> = {
  <S extends 𝛴>(state: S, config?: DestroyConfig): DestroyChain<ɸ, m, S>
}

export type Process<
  ɸ extends Fields = Fields,
  m extends Mass = Mass,
  Res = any,
  v extends Values<ɸ> = Values<ɸ>,
  s extends string = string,
> = ProcessStateMarker<s> & {
  type: ProcessType.ACTION
  action: (params: ActionParams<ɸ, m, v>) => Res | Promise<Res>
  success?: (params: { update: Update<ɸ>; data: Res }) => void
  error?: (params: { update: Update<ɸ>; error: Error }) => void
  label?: string
  desc?: string
  env?: ExecutionEnv[]
}

export type ProcessChain<
  ɸ extends Fields,
  m extends Mass,
  v extends Values<ɸ> = Values<ɸ>,
  s extends string = string,
> = {
  action: <Res>(fn: (params: ActionParams<ɸ, m, v>) => Res | Promise<Res>) => ActionChainByState<s, ɸ, m, Res, v>
}

type ActionChainByState<
  s extends string,
  ɸ extends Fields,
  m extends Mass,
  Res,
  v,
> = ProcessStateMarker<s> & {
  success: (handler: (params: { update: Update<ɸ>; data: Res }) => void) => ActionChainByState<s, ɸ, m, Res, v>
  error: (handler: (params: { update: Update<ɸ>; error: Error }) => void) => ActionChainByState<s, ɸ, m, Res, v>
}

/**
 * Конфигурация одного процесса
 *
 * Содержит основную функцию action и опциональные обработчики success/error.
 * Также может содержать метаданные label и desc.
 *
 * @template ɸ - схема контекста автомата
 * @template m - тип массы автомата
 * @template Res - возвращаемый тип результата action
 *
 * @example
 * ```typescript
 * const process: Process<MyFields, MyMass, { userId: number }> = {
 *   label: "Авторизация",
 *   desc: "Процесс входа пользователя",
 *   action: async ({ value, mass, self }) => {
 *     // Логика авторизации с доступом ко всем параметрам
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
/**
 * Chain API для создания процесса с опциональными параметрами label и desc.
 * Позволяет удобно и строго типизировано описывать обработчики процессов автомата.
 *
 * @template ɸ - схема контекста автомата
 * @template Res - возвращаемый тип результата action
 *
 * @example
 * ```typescript
 * const chain = process("loading", {
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
export type ProcessesList<
  ɸ extends Fields = Fields,
  𝛴 extends string = string,
  m extends Mass = Mass,
  ψ = never,
> = readonly (
  | {
      [S in 𝛴]:
        | ActionChain<ɸ, m, any, SuperpositionProcessValue<ɸ, ψ, S>, S>
        | DestroyChain<ɸ, m, S>
    }[𝛴]
)[]

/**
 * Тип билдера для декларации набора процессов автомата.
 *
 * Позволяет создавать типизированные процессы с удобным API.
 *
 * @template ɸ - схема полей автомата
 * @template 𝛴 - строковые ключи состояний/процессов
 * @template m - тип mass объекта
 * @param process - фабрика для создания цепочки ProcessChain
 * @returns массив state-bound chain-элементов
 */
export type ProcessesDeclaration<
  ɸ extends Fields = Fields,
  𝛴 extends string = string,
  m extends Mass = Mass,
  ψ = never,
> = (
  process: ProcessFactory<ɸ, 𝛴, m, ψ>,
  destroy: DestroyFactory<ɸ, 𝛴, m>,
) => ProcessesList<ɸ, 𝛴, m, ψ>

/**
 * Обработчик действия процесса.
 * Содержит путь к модулю, имя экспорта и список полей контекста, которые читаются.
 */
export type ParsedActionHandler = {
  /** Путь к ESM-модулю с реализацией действия */
  src: string
  /** Имя экспорта для импорта (например, "default", "commit", "process") */
  importSpecifier?: string
  /** Строковое представление исходного wrapper-action для server/runtime исполнения */
  wrapperSrc?: string
  /** Список полей контекста, которые читаются в обработчике */
  read?: string[]
}

/**
 * Обработчик успеха или ошибки процесса.
 * Содержит функцию, список полей для чтения и записи.
 */
export type ParsedHandler = {
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
  type: ProcessType.ACTION | "action"
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

export interface ProcessConfig extends BaseProcessConfig {
  /**
   * Массив сред исполнения, в которых может выполняться процесс.
   * Позволяет указать целевую платформу для процесса.
   *
   * @example
   * ```typescript
   * // Процесс выполняется только в браузере
   * process("loading", { env: ['browser'] })
   *
   * // Процесс выполняется в браузере и node
   * process("loading", { env: ['browser', 'node'] })
   *
   * // Процесс выполняется в любой среде
   * process("loading", { env: ['any'] })
   * ```
   */
  env?: ExecutionEnv[]
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
export type ActionChain<
  ɸ extends Fields,
  m extends Mass,
  Res,
  v extends Values<ɸ> = Values<ɸ>,
  s extends string = string,
> = ActionChainByState<s, ɸ, m, Res, v>
