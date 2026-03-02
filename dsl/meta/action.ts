import type { Schema } from "@zavx0z/context"
import type { Mass } from "./metafor.t"
import type { ReactionAction } from "./reactions.t"

const PATTERN_UPDATE = /\bupdate\s*\(\s*({[\s\S]*?})\s*\)/g
const PATTERN_ARROW = /^\s*(\([^)]+\))\s*=>/

/**
 * Паттерн для поиска динамических импортов import("...") в коде функции.
 * Соответствует import("./module.ts") или import( './module.ts' )
 */
const PATTERN_IMPORT = /import\s*\(\s*["']([^"']+)["']\s*\)/

/**
 * Паттерн для поиска операторов return в коде функции.
 * Соответствует явным return statement (не стрелочные функции =>).
 */
const PATTERN_RETURN = /\breturn\s+[^;]+;?/

export const pattern = {
  dot: /value\.(\w+)/g,
  destructParams: /value:\s*{([^}]+)}/g,
  destructBody: /(?:const|let|var)\s*{([^}]+)}\s*=\s*value(?:\s*,\s*{([^}]+)}\s*=\s*value)*/g,
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
  if (funcString.includes("destroy()")) return funcString.replace("destroy()", `destroy(${arg})`)
  return funcString
}

/**
 * Нормализует строковое представление функции, заменяя минифицированные булевы значения.
 * Заменяет `!0` на `true` и `!1` на `false` для более читаемого вывода.
 *
 * @param funcString - строковое представление функции
 * @returns нормализованная строка
 *
 * @example
 * ```ts
 * const fn = ({ mass }) => { mass.active = true }
 * const str = normalizeFunctionString(fn.toString())
 * // "({ mass }) => { mass.active = true }"
 * ```
 */
export function normalizeFunctionString(funcString: string): string {
  return funcString.replace(/!0\b/g, "true").replace(/!1\b/g, "false")
}

/**
 * Парсит функцию и извлекает информацию о полях, которые читаются и записываются.
 *
 * Анализирует код функции с помощью регулярных выражений для поиска:
 * - Доступа к полям через `value.field`
 * - Деструктуризации параметров `{ field } = value`
 * - Деструктуризации в теле функции `const { field } = value`
 * - Вызовов `update({ field })`
 *
 * @param fn - функция для анализа
 * @param allowWrite - разрешить ли анализ записи полей (по умолчанию true)
 * @returns объект с массивами полей для чтения и записи
 *
 * @example
 * ```ts
 * const fn = ({ value, update }) => {
 *   const { name, age } = value
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
export function extractFields<ɸ extends Schema, 𝛴 extends string, m extends Mass>(reaction: ReactionAction<ɸ, 𝛴, m>) {
  const updateStr = reaction.toString()
  const read: string[] = []
  const write: string[] = []

  // Извлекаем поля, которые читаются из value
  const fieldsMatches = updateStr.match(/value\.(\w+)/g)
  if (fieldsMatches) {
    for (const match of fieldsMatches) {
      const field = match.replace("value.", "")
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

/**
 * Извлекает путь к модулю из динамического импорта в функции.
 *
 * Анализирует код функции и находит первый import("..."), возвращая путь к модулю.
 * Возвращает null, если import не найден.
 *
 * @param fn - Функция для анализа
 * @returns Путь к модулю или null
 *
 * @example
 * ```ts
 * const fn = async ({ value }) => {
 *   const mod = await import("./actions/loader.ts")
 *   return mod.default(value)
 * }
 * const src = extractModuleSrc(fn)
 * // => "./actions/loader.ts"
 * ```
 */
export function extractModuleSrc(fn: Function): string | null {
  const code = fn.toString()
  const importMatch = PATTERN_IMPORT.exec(code)
  return importMatch?.[1] ?? null
}

/**
 * Валидирует структуру функции действия.
 *
 * Проверяет, что функция соответствует требуемому паттерну:
 * 1. Первая значимая строка — import("...") для загрузки модуля
 * 2. Последняя значимая строка — return для возврата результата
 *
 * Из-за транспиляции порядок строк может нарушаться, поэтому валидация
 * проверяет только наличие import и return в теле функции.
 *
 * Функции без тела (пустые заглушки) и стрелочные функции с неявным return
 * считаются валидными.
 *
 * @param fn - Функция для валидации
 * @returns Результат валидации с флагом valid и опциональным сообщением об ошибке
 *
 * @example
 * ```ts
 * // Валидно — с import и return
 * validateActionStructure(async ({ value }) => {
 *   const mod = await import("./mod.ts")
 *   const result = mod.process(value)
 *   return result
 * })
 * // => { valid: true }
 *
 * // Валидно — пустая функция-заглушка
 * validateActionStructure(() => ({}))
 * // => { valid: true }
 *
 * // Невалидно — нет import
 * validateActionStructure(({ value }) => console.log(value))
 * // => { valid: false, error: "..." }
 * ```
 */
export function validateActionStructure(fn: Function): { valid: boolean; error?: string } {
  const code = fn.toString()

  // Удаление комментариев и нормализация
  const normalizedCode = code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .trim()

  // Проверка на пустую функцию-заглушку
  // Пустое тело: () => {} или () => ({})
  const isEmptyStub =
    /^\s*\([^)]*\)\s*=>\s*\{\s*\}\s*$/.test(normalizedCode) ||
    /^\s*\([^)]*\)\s*=>\s*\(\{\}\)\s*$/.test(normalizedCode)

  if (isEmptyStub) {
    return { valid: true }
  }

  // Проверка наличия import
  const importMatch = normalizedCode.match(PATTERN_IMPORT)
  if (!importMatch) {
    return {
      valid: false,
      error:
        'Функция должна содержать import("...") для загрузки модуля',
    }
  }

  // Проверка наличия return
  const returnMatch = normalizedCode.match(PATTERN_RETURN)
  if (!returnMatch) {
    return {
      valid: false,
      error:
        'Функция должна содержать return для возврата результата',
    }
  }

  return { valid: true }
}
