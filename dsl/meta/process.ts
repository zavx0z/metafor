import type { Schema } from "@zavx0z/context"
import { ProcessType, type DestroyConfig, type ProcessConfig, type ExecutionEnv, type ActionParams } from "./process.t"
import type { ParsedProcess, ParsedDestroy, ProcessesDeclaration, ProcessesSchema, Process } from "./process.t"
import { destroyAppendArg, normalizeFunctionString, parseFunction, updateAppendArg, extractModuleSrc, validateActionStructure } from "./action"
import { Initiator, type Mass } from "./metafor.t"


export type { ProcessesDeclaration, ProcessesSchema, ActionParams }

/**
 * Парсит процесс и извлекает информацию о всех обработчиках.
 *
 * Анализирует объект процесса с обработчиками action, success и error.
 * Для action извлекает путь к модулю через extractModuleSrc и валидирует структуру.
 * Для success/error сохраняет строковое представление функции для десериализации.
 *
 * @param process - Объект процесса с обработчиками
 * @returns Распарсенный процесс с информацией о полях и путём к модулю action
 * @throws Error если структура action функции не соответствует требованиям
 *
 * @example
 * ```ts
 * const process = {
 *   action: async ({ value }) => {
 *     const mod = await import("./actions/loader.ts")
 *     return mod.default(value)
 *   },
 *   success: ({ update, data }) => update({ result: data }),
 *   error: ({ update, error }) => update({ error: error.message })
 * }
 * const result = parseProcess(process)
 * // => {
 * //   action: { src: "./actions/loader.ts", read: ['value'] },
 * //   success: { read: [], write: ['result'], src: '({ update, data }) => update({ result: data }, "s")' },
 * //   error: { read: [], write: ['error'], src: '({ update, error }) => update({ error: error.message }, "e")' }
 * // }
 * ```
 */
export function parseProcess<ɸ extends Schema, m extends Mass, Res = any>(process: Process<ɸ, m, Res>): ParsedProcess {
  const result: ParsedProcess = {} as ParsedProcess
  result.type = ProcessType.ACTION
  if (process.label) result.label = process.label
  if (process.desc) result.desc = process.desc

  // Validate action structure
  const validation = validateActionStructure(process.action as Function)
  if (!validation.valid) {
    throw new Error(`Невалидная структура action: ${validation.error}`)
  }

  // Extract module path from import()
  const modulePath = extractModuleSrc(process.action as Function)
  if (!modulePath) {
    throw new Error('Не удалось извлечь путь модуля из import("...") в функции action')
  }

  const parsed = parseFunction(process.action as Function, false)
  result.action = {
    src: modulePath,
    ...(parsed.read.length > 0 ? { read: parsed.read } : {}),
  }

  if (process.success) {
    const parsed = parseFunction(process.success as Function, true)
    const src = normalizeFunctionString(updateAppendArg(process.success.toString(), `"${Initiator.Success}"`))
    result.success = {
      src,
      ...(parsed.read.length > 0 ? { read: parsed.read } : {}),
      ...(parsed.write.length > 0 ? { write: parsed.write } : {}),
    }
  }
  if (process.error) {
    const parsed = parseFunction(process.error as Function)
    const src = normalizeFunctionString(updateAppendArg(process.error.toString(), `"${Initiator.Error}"`))
    result.error = {
      src,
      ...(parsed.read.length > 0 ? { read: parsed.read } : {}),
      ...(parsed.write.length > 0 ? { write: parsed.write } : {}),
    }
  }
  return result
}

/**
 * Парсит конфигурацию процессов и извлекает информацию о всех процессах.
 *
 * Анализирует конфигурацию, где каждое свойство содержит цепочку действий,
 * и возвращает объект с распарсенными процессами.
 *
 * @template C - схема контекста
 * @template S - строковые ключи процессов
 * @template I - тип ядра
 * @param processes - конфигурация процессов
 * @returns объект с распарсенными процессами
 *
 * @example
 * ```ts
 * const processes: ProcessesDeclaration<C, S, M> = (process) => ({
 *   loadUser: process({ label: "loadUser" }).action(({ value }) => fetch(`/users/${value.id}`)),
 *   saveData: process().action(({ value, update }) => update({ saved: true }))
 * }
 * const result = getSnapshotProcesses(processes)
 * // => {
 * //   loadUser: { label: "loadUser", action: { read: ['id'] } },
 * //   saveData: { action: { read: [], write: ['saved'] } }
 * // }
 * ```
 * @param processes - конфигурация процессов
 * @returns объект с распарсенными процессами
 */
export const processesSchema = <ɸ extends Schema, 𝛴 extends string, m extends Mass>(
  processes: ProcessesDeclaration<ɸ, 𝛴, m>
): ProcessesSchema => {
  // Вызываем processesDeclaration с mock process и destroy
  const chains = processes(
    (config?: ProcessConfig) => {
      const chain: any = {
        type: ProcessType.ACTION,
        label: config?.label,
        desc: config?.desc,
        env: config?.env,
        _successHandler: undefined,
        _errorHandler: undefined,
        action: (fn: any) => {
          chain.action = fn
          return chain as any
        },
        success: (handler: any) => {
          chain._successHandler = handler
          return chain
        },
        error: (handler: any) => {
          chain._errorHandler = handler
          return chain
        },
        getResult: () => {
          const result: any = {
            action: chain.action,
          }
          if (chain._successHandler) result.success = chain._successHandler
          if (chain._errorHandler) result.error = chain._errorHandler
          if (chain.label) result.label = chain.label
          if (chain.desc) result.desc = chain.desc
          if (chain.env) result.env = chain.env
          return result
        },
      }
      return chain
    },
    (config?: DestroyConfig) => {
      const chain: any = {
        type: ProcessType.FINALLY,
        label: config?.label,
        desc: config?.desc,
        env: config?.env,
        _beforeHandler: undefined,
        before: (fn: any) => {
          chain._beforeHandler = fn
          return chain
        },
        getResult: () => {
          const result: any = {
            type: ProcessType.FINALLY,
          }
          if (chain._beforeHandler) result.before = chain._beforeHandler
          if (chain.label) result.label = chain.label
          if (chain.desc) result.desc = chain.desc
          if (chain.env) result.env = chain.env
          return result
        },
      }
      return chain
    }
  )

  // Парсим каждый chain
  const result: Record<string, ParsedProcess | ParsedDestroy> = {}
  for (const key in chains) {
    if (chains[key]) {
      // Проверяем, является ли это destroy-процессом
      if ((chains[key] as any).type === ProcessType.FINALLY) {
        // Это destroy-процесс, используем getResult()
        const chain = chains[key] as any
        if ("getResult" in chain && typeof chain.getResult === "function") {
          const chainResult = chain.getResult()
          const parsed = chainResult.before ? parseFunction(chainResult.before, false) : { read: [] }
          result[key] = {
            type: ProcessType.FINALLY,
            before: {
              src: chainResult.before ? normalizeFunctionString(chainResult.before.toString()) : "() => {}",
              ...(parsed.read.length > 0 ? { read: parsed.read } : {}),
            },
            ...(chainResult.label ? { label: chainResult.label } : {}),
            ...(chainResult.desc ? { desc: chainResult.desc } : {}),
            ...(chainResult.env ? { env: chainResult.env } : {}),
          }
        }
      } else {
        // Обычный процесс
        if ("getResult" in chains[key] && typeof chains[key].getResult === "function") {
          const parsedProcess = parseProcess(chains[key].getResult())
          // Add env from chain if present
          const chainEnv = (chains[key] as any).env
          if (chainEnv) {
            parsedProcess.env = chainEnv
          }
          result[key] = parsedProcess
        }
      }
    }
  }

  if (Object.keys(result).length === 0) return {}
  return result
}
