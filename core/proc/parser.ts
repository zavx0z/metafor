/**
 * Парсинг процессов
 * @module Processes
 */

import type { ParsedProcess } from "./parser.t"
import type { ActionChain } from "./index.t"
import type { ContextSchema } from "../context"

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
 *
 * @param process - объект процесса с обработчиками
 * @returns распарсенный процесс с информацией о полях
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
 * //   action: { fn: ..., read: ['data'] },
 * //   success: { fn: ..., read: [], write: ['result'] },
 * //   error: { fn: ..., read: [], write: ['error'] }
 * // }
 * ```
 */
export function parseProcess(process: any): ParsedProcess {
  const result: ParsedProcess = {}
  if (process.action) {
    const parsed = parseFunction(process.action, false)
    result.action = { fn: process.action, read: parsed.read }
  }
  if (typeof process.success === "function") {
    const parsed = parseFunction(process.success)
    result.success = { fn: process.success, ...parsed }
  }
  if (typeof process.error === "function") {
    const parsed = parseFunction(process.error)
    result.error = { fn: process.error, ...parsed }
  }
  return result
}

/**
 * Парсит цепочку действий и извлекает информацию о процессе.
 *
 * Получает результат из цепочки действий и парсит его как процесс.
 *
 * @template C - схема контекста
 * @template Res - тип результата
 * @param chain - цепочка действий
 * @returns распарсенный процесс
 *
 * @example
 * ```ts
 * const chain = process()
 *   .action(({ context }) => fetch(context.url))
 *   .success(({ update, data }) => update({ items: data }))
 * const result = parseChain(chain)
 * // => { action: { fn: ..., read: ['url'] }, success: { fn: ..., write: ['items'] } }
 * ```
 */
export function parseChain<C extends ContextSchema, Res>(chain: ActionChain<C, Res>): ParsedProcess {
  return parseProcess(chain.getResult())
}

/**
 * Парсит объект с цепочками действий и извлекает информацию о всех процессах.
 *
 * Анализирует объект, где каждое свойство содержит цепочку действий,
 * и возвращает объект с распарсенными процессами.
 *
 * @param obj - объект с цепочками действий
 * @returns объект с распарсенными процессами
 *
 * @example
 * ```ts
 * const chains = {
 *   loadUser: process().action(({ context }) => fetch(`/users/${context.id}`)),
 *   saveData: process().action(({ context, update }) => update({ saved: true }))
 * }
 * const result = parseChainsObject(chains)
 * // => {
 * //   loadUser: { action: { fn: ..., read: ['id'] } },
 * //   saveData: { action: { fn: ..., write: ['saved'] } }
 * // }
 * ```
 */
export function parseChainsObject(obj: Record<string, any>): Record<string, ParsedProcess> {
  const result: Record<string, ParsedProcess> = {}
  for (const key in obj) {
    if (obj[key]) {
      result[key] = parseProcess(obj[key])
    }
  }
  return result
}
