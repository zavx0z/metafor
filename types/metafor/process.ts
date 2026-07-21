import type {Fields, Update, Values} from "./fields.ts"
import type {ActionParams} from "./action.ts"
import type {Energy, Mass} from "./schema.ts"
import type {FinallyChain, FinallyConfig, ParsedFinally} from "./finally.ts"
import type {SuperpositionProcessValue} from "./superposition.ts"

declare const ProcessStateBrand: unique symbol

interface ProcessStateMarker<s extends string> {
  readonly [ProcessStateBrand]?: s
}

interface ProcessFactory<
  ɸ extends Fields,
  𝛴 extends string,
  m extends Mass,
  ψ,
  e extends Energy,
> {
  <S extends 𝛴>(state: S, config?: ProcessConfig): ProcessChain<ɸ, m, SuperpositionProcessValue<ɸ, ψ, S>, S, e>
}

interface DestroyFactory<
  ɸ extends Fields,
  𝛴 extends string,
  m extends Mass,
  e extends Energy,
> {
  <S extends 𝛴>(state: S, config?: FinallyConfig): FinallyChain<ɸ, m, S, e>
}

export interface Process<
  ɸ extends Fields = Fields,
  m extends Mass = Mass,
  Res = any,
  v extends Values<ɸ> = Values<ɸ>,
  s extends string = string,
  e extends Energy = Energy,
> extends ProcessStateMarker<s> {
  type: ProcessType.ACTION
  action: (params: ActionParams<ɸ, m, v, e>) => Res | Promise<Res>
  success?: (params: { update: Update<ɸ>; data: Res }) => void
  error?: (params: { update: Update<ɸ>; error: Error }) => void
  label?: string
  desc?: string
  env?: ExecutionEnv[]
}

export interface ProcessChain<
  ɸ extends Fields,
  m extends Mass,
  v extends Values<ɸ> = Values<ɸ>,
  s extends string = string,
  e extends Energy = Energy,
> {
  action: <Res>(fn: (params: ActionParams<ɸ, m, v, e>) => Res | Promise<Res>) => ActionChainByState<s, ɸ, m, Res, v, e>
}

interface ActionChainByState<
  s extends string,
  ɸ extends Fields,
  m extends Mass,
  Res,
  v,
  e extends Energy,
> extends ProcessStateMarker<s> {
  success: (handler: (params: { update: Update<ɸ>; data: Res }) => void) => ActionChainByState<s, ɸ, m, Res, v, e>
  error: (handler: (params: { update: Update<ɸ>; error: Error }) => void) => ActionChainByState<s, ɸ, m, Res, v, e>
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
 * process("loading")
 *   .action(async ({ energy, field, mass, self, value }) => {
 *     const mod = await import("./actions/login.ts")
 *     return mod.default({ energy, field, mass, self, value })
 *   })
 *   .success(({ update, data }) => update({ userId: data.userId }))
 *   .error(({ update, error }) => update({ error: error.message }))
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
 *   .action(async ({ energy, field, mass, self, value }) => {
 *     const mod = await import("./actions/load.ts")
 *     return mod.default({ energy, field, mass, self, value })
 *   })
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
  e extends Energy = Energy,
> = readonly (
  | {
  [S in 𝛴]:
  | ActionChain<ɸ, m, any, SuperpositionProcessValue<ɸ, ψ, S>, S, e>
  | FinallyChain<ɸ, m, S, e>
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
  e extends Energy = Energy,
> = (
  process: ProcessFactory<ɸ, 𝛴, m, ψ, e>,
  destroy: DestroyFactory<ɸ, 𝛴, m, e>,
) => ProcessesList<ɸ, 𝛴, m, ψ, e>

/**
 * Обработчик действия процесса.
 * Содержит путь к модулю, имя экспорта и список полей контекста, которые читаются.
 */
export interface ParsedActionHandler {
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
export interface ParsedHandler {
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
export interface ParsedProcess {
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
export interface ProcessesSchema {
  [key: string]: ParsedProcess | ParsedFinally
}

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
 * const chain = process("loading").action(async ({ energy, field, mass, self, value }) => {
 *   const mod = await import("./actions/load.ts")
 *   return mod.default({ energy, field, mass, self, value })
 * })
 *   .success(({ update, data }) => update({ name: data.name }))
 *   .error(({ update, error }) => update({ name: error.message }))
 *
 * chain.getResult() // { action, success, error }
 * ```
 */
export interface ActionChain<
  ɸ extends Fields,
  m extends Mass,
  Res,
  v extends Values<ɸ> = Values<ɸ>,
  s extends string = string,
  e extends Energy = Energy,
> extends ActionChainByState<s, ɸ, m, Res, v, e> {}

export type ProcessChainResult<ɸ extends Fields, m extends Mass, Res, v extends Values<ɸ>, s extends string, e extends Energy = Energy> = ActionChain<
  ɸ,
  m,
  Res,
  v,
  s,
  e
> & {
  readonly type: ProcessType.ACTION
  getResult: () => Process<ɸ, m, Res, v, s, e>
}

export type ProcessRuntimeResult<ɸ extends Fields, m extends Mass, Res, v extends Values<ɸ>, s extends string, e extends Energy = Energy> =
  Process<ɸ, m, Res, v, s, e>
  & {
  state: s
}

export type ProcessChainLike<ɸ extends Fields, m extends Mass, v extends Values<ɸ> = Values<ɸ>, s extends string = string, e extends Energy = Energy> = {
  readonly type: ProcessType.ACTION
  getResult: () => ProcessRuntimeResult<ɸ, m, unknown, v, s, e>
}
