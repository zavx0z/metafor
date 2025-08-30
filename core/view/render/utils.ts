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

  if (Array.isArray(dataPath)) {
    // Для множественных значений заменяем [0], [1], [2] и т.д.
    for (let i = 0; i < dataPath.length; i++) {
      const path = dataPath[i]
      if (path) {
        const value = getNestedValue(path, params)
        // Для core объектов используем прямое обращение к params.core
        if (path.startsWith("/core/")) {
          const corePath = path.slice(6) // убираем "/core/"
          result = result.replace(new RegExp(`\\[${i}\\]`, "g"), `params.core.${corePath}`)
        } else {
          result = result.replace(new RegExp(`\\[${i}\\]`, "g"), JSON.stringify(value))
        }
      }
    }
  } else {
    // Для одного значения заменяем [0]
    const value = getValueByPath(dataPath, params)
    // Для core объектов используем прямое обращение к params.core
    if (dataPath.startsWith("/core/")) {
      const corePath = dataPath.slice(6) // убираем "/core/"
      // Заменяем слэши на точки для правильного доступа к свойствам
      const dotPath = corePath.replace(/\//g, ".")
      result = result.replace(/\[0\]/g, `params.core.${dotPath}`)
    } else {
      result = result.replace(/\[0\]/g, JSON.stringify(value))
    }
  }

  try {
    // Если выражение содержит шаблонный литерал, обрабатываем его как шаблонную строку
    if (result.includes("${") && !result.startsWith("`")) {
      // Превращаем в шаблонный литерал
      const templateResult = "`" + result + "`"
      const evalResult = Function("params", `"use strict"; return ${templateResult}`)(params)
      return evalResult
    } else {
      // Выполняем JavaScript выражение
      const evalResult = Function("params", `"use strict"; return (${result})`)(params)
      return evalResult
    }
  } catch (error) {
    console.warn("Failed to evaluate expression:", result, error)
    // Возвращаем исходное выражение без замен, если не удалось выполнить
    return expr
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
        // Если значение - массив, берем его длину или первый элемент
        let stringValue = String(value)
        if (Array.isArray(value)) {
          stringValue = String(value.length)
        }
        // Экранируем значение для использования в шаблонной строке
        const escapedValue = stringValue.replace(/`/g, "\\`").replace(/\$/g, "\\$")
        result = result.replace(new RegExp(`\\[${i}\\]`, "g"), escapedValue)
      }
    }
  } else {
    // Для одного значения заменяем [0]
    const value = getValueByPathWithItem(dataPath, item, parentItem, params, itemStack)
    // Если значение - массив, берем его длину или первый элемент
    let stringValue = String(value)
    if (Array.isArray(value)) {
      stringValue = String(value.length)
    }
    // Экранируем значение для использования в шаблонной строке
    const escapedValue = stringValue.replace(/`/g, "\\`").replace(/\$/g, "\\$")
    result = result.replace(/\[0\]/g, escapedValue)
  }

  // Убираем ${} из результата
  return result.replace(/\$\{([^}]+)\}/g, "$1")
}
