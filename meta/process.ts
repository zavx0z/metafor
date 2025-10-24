import type { Schema } from "@zavx0z/context"
import type { Core } from "../atom/gravity.t"
import type { Process } from "../atom/src/processes"
import { ProcessType, type DestroyConfig, type ProcessConfig } from "./process.t"
import type { ParsedProcess, ParsedDestroy, ProcessesDeclaration, ProcessesSchema } from "./process.t"
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
  result.type = "action" as any
  if (process.label) result.label = process.label
  if (process.desc) result.desc = process.desc

  const parsed = parseFunction(process.action, false)
  result.action = {
    src: process.action.toString(),
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
): ProcessesSchema => {
  // Вызываем processesDeclaration с mock process и destroy
  const chains = processes(
    (config?: ProcessConfig) => {
      const chain: any = {
        type: ProcessType.ACTION,
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
    },
    (config?: DestroyConfig) => {
      const chain: any = {
        type: ProcessType.FINALLY,
        label: config?.label,
        desc: config?.desc,
        recursive: config?.recursive,
        _beforeHandler: undefined,
        before: (fn: any) => {
          chain._beforeHandler = fn
          return chain
        },
        getResult: () => {
          const result: any = {
            type: ProcessType.FINALLY,
            recursive: chain.recursive,
          }
          if (chain._beforeHandler) result.before = chain._beforeHandler
          if (chain.label) result.label = chain.label
          if (chain.desc) result.desc = chain.desc
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
              src: chainResult.before ? chainResult.before.toString() : "() => {}",
              ...(parsed.read.length > 0 ? { read: parsed.read } : {}),
            },
            ...(chainResult.label ? { label: chainResult.label } : {}),
            ...(chainResult.desc ? { desc: chainResult.desc } : {}),
            ...(chainResult.recursive === true ? { recursive: chainResult.recursive } : {}),
          }
        }
      } else {
        // Обычный процесс
        if ("getResult" in chains[key] && typeof chains[key].getResult === "function") {
          result[key] = parseProcess(chains[key].getResult())
        }
      }
    }
  }

  if (Object.keys(result).length === 0) return {}
  return result
}
