import type { Schema } from "@zavx0z/context"
import type { Core } from "../core/index.t"
import type { Process } from "../core/proc"
import type { ProcessConfig } from "./process.t"
import type { ParsedProcess, ProcessesDeclaration, SnapshotProcesses } from "./process.t"

export type { ProcessesDeclaration }

const pattern = {
  dot: /context\.(\w+)/g,
  destructParams: /context:\s*{([^}]+)}/g,
  destructBody: /(?:const|let|var)\s*{([^}]+)}\s*=\s*context(?:\s*,\s*{([^}]+)}\s*=\s*context)*/g,
  update: /update\(\s*{([^}]+)}\s*\)/g,
}
/**
 * Парсит функцию и извлекает информацию о полях контекста, которые читаются и записываются.
 *
 * Анализирует код функции с помощью регулярных выражений для поиска:
 * - Доступа к полям через `context.field`
 * - Деструктуризации параметров `{ field } = context`
 * - Деструктуризации в теле функции `const { field } = context`
 * - Вызовов `update({ field })`
 *
 * @param fn - функция для анализа
 * @param allowWrite - разрешить ли анализ записи полей (по умолчанию true)
 * @returns объект с массивами полей для чтения и записи
 *
 * @example
 * ```ts
 * const fn = ({ context, update }) => {
 *   const { name, age } = context
 *   update({ status: 'active' })
 * }
 * const result = parseFunction(fn)
 * // => { read: ['name', 'age'], write: ['status'] }
 * ```
 */

export function parseFunction(fn: Function, allowWrite: boolean = true) {
  const code = fn.toString()
  const read = new Set<string>()
  const write = new Set<string>()
  let match
  while ((match = pattern.dot.exec(code)) !== null) {
    if (match && typeof match[1] === "string" && match[1].length > 0) {
      read.add(match[1])
    }
  }
  while ((match = pattern.destructParams.exec(code)) !== null) {
    const s = typeof match[1] === "string" ? match[1] : ""
    if (s.length > 0) {
      s.split(",")
        .map((p) => p?.trim())
        .filter(Boolean)
        .forEach((p) => read.add(p))
    }
  }
  for (const match of code.matchAll(pattern.destructBody)) {
    if (match && Array.isArray(match)) {
      const m1 = typeof match[1] === "string" ? match[1] : undefined
      const m2 = typeof match[2] === "string" ? match[2] : undefined
      const propsArr = [m1, m2].filter((v): v is string => typeof v === "string" && v.length > 0)
      const props = propsArr.length > 0 ? propsArr.join(",") : ""
      if (props.length > 0) {
        props
          .split(",")
          .map((p) => p?.trim()?.split(":")[0]?.trim() ?? "")
          .filter(Boolean)
          .forEach((p) => read.add(p))
      }
    }
  }
  while ((match = pattern.update.exec(code)) !== null) {
    const s = typeof match[1] === "string" ? match[1] : ""
    if (s.length > 0) {
      s.split(",")
        .map((p) => p?.split(":")[0]?.trim() ?? "")
        .filter(Boolean)
        .forEach((p) => write.add(p))
    }
  }
  return { read: Array.from(read), write: allowWrite ? Array.from(write) : [] }
}
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
  const result: ParsedProcess = {}
  if (process.title) result.title = process.title
  if (process.description) result.description = process.description

  const parsed = parseFunction(process.action, false)
  result.action = {
    src: process.action.toString(),
    ...(parsed.read.length > 0 ? { read: parsed.read } : {}),
  }

  if (process.success) {
    const parsed = parseFunction(process.success, true)
    result.success = {
      src: process.success.toString(),
      ...(parsed.read.length > 0 ? { read: parsed.read } : {}),
      ...(parsed.write.length > 0 ? { write: parsed.write } : {}),
    }
  }
  if (process.error) {
    const parsed = parseFunction(process.error)
    result.error = {
      src: process.error.toString(),
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
 *   loadUser: process({ title: "loadUser" }).action(({ context }) => fetch(`/users/${context.id}`)),
 *   saveData: process().action(({ context, update }) => update({ saved: true }))
 * }
 * const result = getSnapshotProcesses(processes)
 * // => {
 * //   loadUser: { title: "loadUser", action: { read: ['id'] } },
 * //   saveData: { action: { read: [], write: ['saved'] } }
 * // }
 * ```
 * @param processes - конфигурация процессов
 * @returns объект с распарсенными процессами
 */

export const serializeProcesses = <C extends Schema, S extends string, I extends Core>(
  processes: ProcessesDeclaration<C, S, I>
): SnapshotProcesses | null => {
  // Вызываем processesDeclaration с mock process
  const chains = processes((config?: ProcessConfig) => {
    const chain = {
      title: config?.title,
      description: config?.description,
      action: (fn: any) => {
        chain.action = fn
        return chain as any
      },
      success: (handler: any) => {
        chain.success = handler
        return chain
      },
      error: (handler: any) => {
        chain.error = handler
        return chain
      },
      getResult: () => chain,
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
