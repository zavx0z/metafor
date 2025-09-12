/**
 * Преобразует значение в boolean с учетом строковых "ложных" значений
 */
export function toBoolean(value: any): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value)
  if (value == null) return false
  if (typeof value === "string") {
    const s = value.trim().toLowerCase()
    return !(s === "" || s === "false" || s === "0" || s === "null" || s === "undefined" || s === "nan")
  }
  return !!value
}

/**
 * Преобразует значение в валидный токен класса
 */
export function stringifyClassToken(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "boolean") return "" // булево в класс не пускаем
  const s = String(v).trim()
  // отсечём мусорные представления объектов/массивов
  if (s === "" || s === "[object Object]" || s === "[object Array]") return ""
  return s
}

/**
 * Получает вложенное значение по пути
 */
export function getNestedValue(
  path: string,
  params: {
    state: string
    context: Record<string, any>
    core: Record<string, any>
  }
): any {
  // Определяем источник данных
  let dataSource: Record<string, any>
  let cleanPath: string

  if (path.startsWith("/context/")) {
    dataSource = params.context
    cleanPath = path.slice(9)
  } else if (path.startsWith("/core/")) {
    dataSource = params.core
    cleanPath = path.slice(6)
  } else if (path.startsWith("/state")) {
    dataSource = { state: params.state }
    cleanPath = "state"
  } else if (path.startsWith("/") && !path.includes("/", 1)) {
    // Это может быть литеральное значение типа "/admin", "/user", etc.
    // Возвращаем строку без начального слеша
    return path.slice(1)
  } else {
    // По умолчанию используем context
    dataSource = params.context
    cleanPath = path
  }

  // Разбиваем путь на части
  const parts = cleanPath.split("/").filter(Boolean)

  let current = dataSource
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = current[part]
  }

  return current
}

/**
 * Получает значение по пути из объекта
 */
export function getValueByPath(
  path: string | string[],
  params: {
    state: string
    context: Record<string, any>
    core: Record<string, any>
  }
): any {
  if (typeof path === "string") {
    return getNestedValue(path, params)
  }

  // Для массива путей берем первый
  if (Array.isArray(path) && path.length > 0) {
    const firstPath = path[0]
    if (firstPath) {
      return getNestedValue(firstPath, params)
    }
  }

  return undefined
}

/**
 * Вычисляет выражение с интерполяцией
 */
export function evaluateExpression(
  expr: string,
  dataPath: string | string[],
  params: {
    state: string
    context: Record<string, any>
    core: Record<string, any>
  }
): any {
  let result = expr

  // Проверяем, является ли это простым шаблоном строки (содержит только плейсхолдеры и текст, без операторов)
  const isSimpleTemplate = /^[^+\-*/()&|!=<>]+$/.test(expr) && expr.includes("${[")

  if (Array.isArray(dataPath)) {
    // Для множественных значений заменяем [0], [1], [2] и т.д.
    for (let i = 0; i < dataPath.length; i++) {
      const path = dataPath[i]
      if (path) {
        const value = getNestedValue(path, params)

        if (isSimpleTemplate) {
          // Для простых шаблонов просто заменяем плейсхолдеры на значения без кавычек
          result = result.replace(new RegExp(`\\$\\{\\[${i}\\]\\}`, "g"), String(value))
        } else {
          // Для JavaScript выражений обрабатываем кавычки
          const hasQuotes = result.includes(`"\${[${i}]}"`)

          if (hasQuotes) {
            // Если плейсхолдер уже в кавычках, заменяем без добавления кавычек
            const replacement = typeof value === "string" ? value : JSON.stringify(value)
            result = result.replace(new RegExp(`"\\$\\{\\[${i}\\]\\}"`, "g"), `"${replacement}"`)
          } else {
            // Если плейсхолдера нет в кавычках, добавляем кавычки для строк
            const replacement = typeof value === "string" ? `"${value}"` : JSON.stringify(value)
            result = result.replace(new RegExp(`\\$\\{\\[${i}\\]\\}`, "g"), replacement)
          }
        }
      }
    }
  } else {
    // Для одного значения заменяем [0]
    const value = getValueByPath(dataPath, params)

    if (isSimpleTemplate) {
      // Для простых шаблонов просто заменяем плейсхолдеры на значения без кавычек
      result = result.replace(/\$\{\[0\]\}/g, String(value))
    } else {
      // Заменяем плейсхолдер на значение, правильно экранируя строки
      const replacement = typeof value === "string" ? `"${value}"` : JSON.stringify(value)
      result = result.replace(/\$\{\[0\]\}/g, replacement)
    }
  }

  if (isSimpleTemplate) {
    // Для простых шаблонов возвращаем результат как есть
    return result
  } else {
    try {
      // Выполняем JavaScript выражение
      const evalResult = Function("params", `"use strict"; return (${result})`)(params)
      return evalResult
    } catch (error) {
      console.warn("Failed to evaluate expression:", result, error)
      // Возвращаем исходное выражение без замен, если не удалось выполнить
      return expr
    }
  }
}

/**
 * Получает вложенное значение по пути из элемента массива
 */
export function getNestedValueWithItem(
  path: string,
  item: any,
  parentItem?: any,
  params?: any,
  itemStack: Array<{ item: any; index: number }> = []
): any {
  // Обрабатываем абсолютные пути (начинающиеся с /)
  if (path.startsWith("/")) {
    if (!params) {
      return undefined
    }
    // Убираем "/" и обрабатываем как обычный путь
    const absolutePath = path.slice(1)
    return getNestedValue(absolutePath, params)
  }

  // Обрабатываем относительные пути любой глубины
  if (path.startsWith("../")) {
    const ancestors = Array.isArray(parentItem) ? parentItem : parentItem ? [parentItem] : []
    if (ancestors.length === 0) return undefined

    // Считаем, сколько ../ подряд
    let rest = path
    let hops = 0
    while (rest.startsWith("../")) {
      hops++
      rest = rest.slice(3)
    }

    const base = ancestors[hops - 1] // 1-й ../ → ancestors[0], 2-й → ancestors[1], ...
    const nextAncestors = ancestors.slice(hops)

    // Убираем префикс "[item]" если есть в целевом пути
    if (rest.startsWith("[item]")) {
      rest = rest.slice(6)
    }

    // Разбиваем путь на части и получаем значение
    const parts = rest.split("/").filter(Boolean)
    let current = base
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }

      // Проверяем, является ли часть пути индексом
      if (part === "[index]") {
        // Ищем индекс в стеке элементов
        const currentStackEntry = itemStack[itemStack.length - 1]
        if (currentStackEntry) {
          current = currentStackEntry.index
        } else {
          return undefined
        }
      } else {
        current = current[part]
      }
    }
    return current
  }

  // Убираем префикс "[item]" если есть
  if (path.startsWith("[item]")) {
    path = path.slice(6)
  }

  // Разбиваем путь на части
  const parts = path.split("/").filter(Boolean)

  let current = item
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }

    // Проверяем, является ли часть пути индексом
    if (part === "[index]") {
      // Ищем индекс текущего элемента в стеке
      const currentStackEntry = itemStack[itemStack.length - 1]
      if (currentStackEntry) {
        current = currentStackEntry.index
      } else {
        return undefined
      }
    } else {
      current = current[part]
    }
  }

  return current
}

/**
 * Получает значение по пути из элемента массива
 */
export function getValueByPathWithItem(
  path: string | string[],
  item: any,
  parentItem?: any,
  params?: any,
  itemStack: Array<{ item: any; index: number }> = []
): any {
  if (typeof path === "string") {
    return getNestedValueWithItem(path, item, parentItem, params, itemStack)
  }

  // Для массива путей берем первый
  if (Array.isArray(path) && path.length > 0) {
    const firstPath = path[0]
    if (firstPath) {
      return getNestedValueWithItem(firstPath, item, parentItem, params, itemStack)
    }
  }

  return undefined
}

/**
 * Вычисляет выражение с интерполяцией для элемента массива
 */
export function evaluateExpressionWithItem(
  expr: string,
  dataPath: string | string[],
  item: any,
  parentItem?: any,
  params?: any,
  itemStack: Array<{ item: any; index: number }> = []
): any {
  let result = expr

  if (Array.isArray(dataPath)) {
    // Для множественных значений заменяем [0], [1], [2] и т.д.
    for (let i = 0; i < dataPath.length; i++) {
      const path = dataPath[i]
      if (path) {
        const value = getNestedValueWithItem(path, item, parentItem, params, itemStack)
        // Заменяем плейсхолдер на значение, правильно экранируя строки
        const replacement = typeof value === "string" ? `"${value}"` : JSON.stringify(value)
        result = result.replace(new RegExp(`\\$\\{\\[${i}\\]\\}`, "g"), replacement)
      }
    }
  } else {
    // Для одного значения заменяем [0]
    const value = getValueByPathWithItem(dataPath, item, parentItem, params, itemStack)
    // Заменяем плейсхолдер на значение, правильно экранируя строки
    const replacement = typeof value === "string" ? `"${value}"` : JSON.stringify(value)
    result = result.replace(/\$\{\[0\]\}/g, replacement)
  }

  try {
    // Выполняем JavaScript выражение
    const evalResult = Function("params", `"use strict"; return (${result})`)(params)
    return evalResult
  } catch (error) {
    console.warn("Failed to evaluate expression:", result, error)
    // Возвращаем исходное выражение без замен, если не удалось выполнить
    return expr
  }
}
