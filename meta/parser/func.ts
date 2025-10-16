import type { Schema } from "@zavx0z/context"
import type { Core } from "../../actor/gravity/index.t"
import type { ReactionAction } from "../reactions.t"

const PATTERN_UPDATE = /\bupdate\s*\(\s*({[\s\S]*?})\s*\)/g
const PATTERN_ARROW = /^\s*(\([^)]+\))\s*=>/

export const pattern = {
  dot: /context\.(\w+)/g,
  destructParams: /context:\s*{([^}]+)}/g,
  destructBody: /(?:const|let|var)\s*{([^}]+)}\s*=\s*context(?:\s*,\s*{([^}]+)}\s*=\s*context)*/g,
  update: /update\(\s*{([^}]+)}\s*\)/g,
}
export function updateAppendArg(funcString: string, arg: string) {
  if (funcString.includes("update(data)")) return funcString.replace("update(data)", `update(data, ${arg})`)
  return funcString.replace(PATTERN_UPDATE, (_, obj) => `update(${obj}, ${arg})`)
}

export function trimArrow(funcString: string) {
  const match = funcString.match(PATTERN_ARROW)
  if (!match) return funcString
  return funcString.slice(match[0].length).trim()
}

export function destroyAppendArg(funcString: string, arg: string) {
  if (funcString.includes("destroy()")) return funcString.replace("destroy()", `destroy(true, ${arg})`)
  if (funcString.includes("destroy(true)")) return funcString.replace("destroy(true)", `destroy(true, ${arg})`)
  if (funcString.includes("destroy(false)")) return funcString.replace("destroy(false)", `destroy(false, ${arg})`)
  return funcString
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
 * Анализирует функцию update для извлечения полей
 */
export function extractFields<C extends Schema, S extends string, I extends Core>(reaction: ReactionAction<C, S, I>) {
  const updateStr = reaction.toString()
  const read: string[] = []
  const write: string[] = []

  // Извлекаем поля, которые читаются из контекста
  const contextMatches = updateStr.match(/context\.(\w+)/g)
  if (contextMatches) {
    for (const match of contextMatches) {
      const field = match.replace("context.", "")
      if (!read.includes(field)) {
        read.push(field)
      }
    }
  }

  // Извлекаем поля, которые записываются через update
  const updateMatches = updateStr.match(/update\(\s*\{\s*(\w+):/g)
  if (updateMatches) {
    for (const match of updateMatches) {
      const fieldMatch = match.match(/update\(\s*\{\s*(\w+):/)
      if (fieldMatch && fieldMatch[1]) {
        const field = fieldMatch[1]
        if (!write.includes(field)) {
          write.push(field)
        }
      }
    }
  }

  // Если поле записывается, то оно также читается
  for (const writeField of write) {
    if (!read.includes(writeField)) {
      read.push(writeField)
    }
  }

  return { read, write }
}
