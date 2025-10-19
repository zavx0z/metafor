import type { Schema } from "@zavx0z/context"
import type { Core } from "../atom/gravity.t"
import type { Process } from "../atom/src/processes"
import type { ProcessConfig } from "./process.t"
import type { ParsedProcess, ProcessesDeclaration, ProcessesSchema } from "./process.t"
import { destroyAppendArg, parseFunction, updateAppendArg } from "./parser/func"
import { Initiator } from "../atom/em.t"

export type { ProcessesDeclaration, ProcessesSchema }

/**
 * Парсит процесс и извлекает информацию о всех обработчиках.
 *
 * Анализирует объект процесса, содержащий обработчики action, success и error.
 * Для каждого обработчика извлекает информацию о полях контекста.
 * Для всех обработчиков сохраняет строковое представление функции для десериализации.
 *
 * @param process - объект процесса с обработчиками
 * @returns распарсенный процесс с информацией о полях и строковым представлением всех функций
 *
 * @example
 * ```ts
 * const process = {
 *   action: ({ context }) => context.data,
 *   success: ({ update, data }) => update({ result: data }),
 *   error: ({ update, error }) => update({ error: error.message })
 * }
 * const result = parseProcess(process)
 * // => {
 * //   action: { read: ['data'], src: '({ context }) => context.data' },
 * //   success: { read: [], write: ['result'], src: '({ update, data }) => update({ result: data })' },
 * //   error: { read: [], write: ['error'], src: '({ update, error }) => update({ error: error.message })' }
 * // }
 * ```
 */
export function parseProcess<C extends Schema, I extends Core, Res = any>(process: Process<C, I, Res>): ParsedProcess {
  const result: ParsedProcess = {} as ParsedProcess
  if (process.label) result.label = process.label
  if (process.desc) result.desc = process.desc

  const parsed = parseFunction(process.action, false)
  result.action = {
    src: destroyAppendArg(process.action.toString(), `"${Initiator.Process}"`),
    ...(parsed.read.length > 0 ? { read: parsed.read } : {}),
  }

  if (process.success) {
    const parsed = parseFunction(process.success, true)
    const src = updateAppendArg(process.success.toString(), `"${Initiator.Success}"`)
    result.success = {
      src,
      ...(parsed.read.length > 0 ? { read: parsed.read } : {}),
      ...(parsed.write.length > 0 ? { write: parsed.write } : {}),
    }
  }
  if (process.error) {
    const parsed = parseFunction(process.error)
    const src = updateAppendArg(process.error.toString(), `"${Initiator.Error}"`)
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
 * const processes: ProcessesDeclaration<C, S, I> = (process) => ({
 *   loadUser: process({ label: "loadUser" }).action(({ context }) => fetch(`/users/${context.id}`)),
 *   saveData: process().action(({ context, update }) => update({ saved: true }))
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
export const processesSchema = <C extends Schema, S extends string, I extends Core>(
  processes: ProcessesDeclaration<C, S, I>
): ProcessesSchema | null => {
  // Вызываем processesDeclaration с mock process
  const chains = processes((config?: ProcessConfig) => {
    const chain: any = {
      label: config?.label,
      desc: config?.desc,
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
        return result
      },
    }
    return chain
  })

  // Парсим каждый chain
  const result: Record<string, ParsedProcess> = {}
  for (const key in chains) {
    if (chains[key]) {
      result[key] = parseProcess(chains[key].getResult())
    }
  }

  if (Object.keys(result).length === 0) return null
  return result
}
