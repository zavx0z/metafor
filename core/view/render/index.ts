import type { ExtractValues, Update } from "../../context/index.t"
import type { ContextSchema } from "../../context/types.t.ts"
import type { Core } from "../../index.t.ts"
import type { Node, NodeElement, NodeText, NodeMap } from "../parser/index.t"

/**
 * Основная функция рендеринга
 */
export function render<C extends ContextSchema, S extends string, I extends Core>({
  state,
  context,
  core,
  container,
  update,
  schema,
}: {
  state: S
  context: ExtractValues<C>
  core: I
  container: HTMLElement | DocumentFragment
  update: Update<C>
  schema: Node[]
}): void {
  if (!schema) return

  // Очищаем контейнер
  if ("innerHTML" in container) {
    container.innerHTML = ""
  } else {
    // Для DocumentFragment очищаем все дочерние элементы
    while (container.firstChild) {
      container.removeChild(container.firstChild)
    }
  }

  // Рендерим каждый узел схемы
  for (const node of schema) {
    const element = renderNode(node, { state, context, core, update })
    if (element) {
      container.appendChild(element)
    }
  }
}

/**
 * Рендерит отдельный узел
 */
function renderNode<C extends ContextSchema>(
  node: Node,
  params: {
    state: string
    context: ExtractValues<C>
    core: Record<string, any>
    update: Update<C>
  }
): HTMLElement | Text | DocumentFragment | null {
  switch (node.type) {
    case "el":
      return renderElement(node as NodeElement, params)
    case "text":
      return renderText(node as NodeText, params)
    case "map":
      return renderMap(node as NodeMap, params)
    default:
      return null
  }
}

/**
 * Рендерит HTML элемент
 */
function renderElement<C extends ContextSchema>(
  node: NodeElement,
  params: {
    state: string
    context: ExtractValues<C>
    core: Record<string, any>
    update: Update<C>
  }
): HTMLElement {
  const element = document.createElement(node.tag)

  // Добавляем атрибуты
  if (node.string) {
    for (const [key, value] of Object.entries(node.string)) {
      element.setAttribute(key, String(value))
    }
  }

  // Рендерим дочерние элементы
  if (node.child) {
    for (const childNode of node.child) {
      const childElement = renderNode(childNode, params)
      if (childElement) {
        if (childElement instanceof DocumentFragment) {
          // Для DocumentFragment добавляем все дочерние элементы
          while (childElement.firstChild) {
            element.appendChild(childElement.firstChild)
          }
        } else {
          element.appendChild(childElement)
        }
      }
    }
  }

  return element
}

/**
 * Рендерит map узел
 */
function renderMap<C extends ContextSchema>(
  node: NodeMap,
  params: {
    state: string
    context: ExtractValues<C>
    core: Record<string, any>
    update: Update<C>
  }
): DocumentFragment {
  const fragment = document.createDocumentFragment()

  // Получаем массив данных
  const array = getNestedValue(node.data, params)

  if (Array.isArray(array)) {
    // Рендерим каждый элемент массива
    for (const item of array) {
      for (const childNode of node.child) {
        const childElement = renderNodeWithItem(childNode, params, item)
        if (childElement) {
          fragment.appendChild(childElement)
        }
      }
    }
  }

  return fragment
}

/**
 * Рендерит узел с контекстом элемента массива
 */
function renderNodeWithItem<C extends ContextSchema>(
  node: Node,
  params: {
    state: string
    context: ExtractValues<C>
    core: Record<string, any>
    update: Update<C>
  },
  item: any
): HTMLElement | Text | null {
  switch (node.type) {
    case "el":
      return renderElementWithItem(node as NodeElement, params, item)
    case "text":
      return renderTextWithItem(node as NodeText, params, item)
    default:
      return null
  }
}

/**
 * Рендерит HTML элемент с контекстом элемента массива
 */
function renderElementWithItem<C extends ContextSchema>(
  node: NodeElement,
  params: {
    state: string
    context: ExtractValues<C>
    core: Record<string, any>
    update: Update<C>
  },
  item: any
): HTMLElement {
  const element = document.createElement(node.tag)

  // Добавляем атрибуты
  if (node.string) {
    for (const [key, value] of Object.entries(node.string)) {
      element.setAttribute(key, String(value))
    }
  }

  // Рендерим дочерние элементы
  if (node.child) {
    for (const childNode of node.child) {
      const childElement = renderNodeWithItem(childNode, params, item)
      if (childElement) {
        element.appendChild(childElement)
      }
    }
  }

  return element
}

/**
 * Рендерит текстовый узел с контекстом элемента массива
 */
function renderTextWithItem<C extends ContextSchema>(
  node: NodeText,
  params: {
    state: string
    context: ExtractValues<C>
    core: Record<string, any>
    update: Update<C>
  },
  item: any
): Text {
  let text = ""

  if (node.value) {
    // Статический текст
    text = node.value
  } else if (node.data && node.expr) {
    // Смешанный текст с интерполяцией
    text = evaluateExpressionWithItem(node.expr, node.data, item)
  } else if (node.data) {
    // Простая интерполяция
    const value = getValueByPathWithItem(node.data, item)
    text = String(value)
  }

  return document.createTextNode(text)
}

/**
 * Получает значение по пути из элемента массива
 */
function getValueByPathWithItem(path: string | string[], item: any): any {
  if (typeof path === "string") {
    return getNestedValueWithItem(path, item)
  }

  // Для массива путей берем первый
  if (Array.isArray(path) && path.length > 0) {
    const firstPath = path[0]
    if (firstPath) {
      return getNestedValueWithItem(firstPath, item)
    }
  }

  return undefined
}

/**
 * Получает вложенное значение по пути из элемента массива
 */
function getNestedValueWithItem(path: string, item: any): any {
  // Убираем префикс "[item]" если есть
  let cleanPath = path
  if (path.startsWith("[item]")) {
    cleanPath = path.slice(6)
  }

  // Разбиваем путь на части
  const parts = cleanPath.split("/").filter(Boolean)

  let current = item
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = current[part]
  }

  return current
}

/**
 * Вычисляет выражение с интерполяцией для элемента массива
 */
function evaluateExpressionWithItem(expr: string, dataPath: string | string[], item: any): string {
  if (Array.isArray(dataPath)) {
    // Для множественных значений заменяем ${0}, ${1}, ${2} и т.д.
    let result = expr
    for (let i = 0; i < dataPath.length; i++) {
      const path = dataPath[i]
      if (path) {
        const value = getNestedValueWithItem(path, item)
        result = result.replace(new RegExp(`\\$\\{${i}\\}`, "g"), String(value))
      }
    }
    return result
  } else {
    // Для одного значения заменяем ${0}
    const value = getValueByPathWithItem(dataPath, item)
    return expr.replace(/\$\{0\}/g, String(value))
  }
}

/**
 * Рендерит текстовый узел
 */
function renderText<C extends ContextSchema>(
  node: NodeText,
  params: {
    state: string
    context: ExtractValues<C>
    core: Record<string, any>
    update: Update<C>
  }
): Text {
  let text = ""

  if (node.value) {
    // Статический текст
    text = node.value
  } else if (node.data && node.expr) {
    // Смешанный текст с интерполяцией
    text = evaluateExpression(node.expr, node.data, params)
  } else if (node.data) {
    // Простая интерполяция
    const value = getValueByPath(node.data, params)
    text = String(value)
  }

  return document.createTextNode(text)
}

/**
 * Определяет источник данных для пути
 */
function getDataSource(
  dataPath: string | string[],
  params: {
    state: string
    context: Record<string, any>
    core: Record<string, any>
  }
): Record<string, any> {
  if (typeof dataPath === "string") {
    if (dataPath.startsWith("/context/")) {
      return params.context
    } else if (dataPath.startsWith("/core/")) {
      return params.core
    } else if (dataPath.startsWith("/state")) {
      return { state: params.state }
    }
  } else if (Array.isArray(dataPath)) {
    // Для массива путей создаем объединенный объект
    const combined = { ...params.context, ...params.core, state: params.state }
    return combined
  }

  // По умолчанию используем context
  return params.context
}

/**
 * Получает значение по пути из объекта
 */
function getValueByPath(
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
 * Получает вложенное значение по пути
 */
function getNestedValue(
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
 * Вычисляет выражение с интерполяцией
 */
function evaluateExpression(
  expr: string,
  dataPath: string | string[],
  params: {
    state: string
    context: Record<string, any>
    core: Record<string, any>
  }
): string {
  if (Array.isArray(dataPath)) {
    // Для множественных значений заменяем ${0}, ${1}, ${2} и т.д.
    let result = expr
    for (let i = 0; i < dataPath.length; i++) {
      const path = dataPath[i]
      if (path) {
        const value = getNestedValue(path, params)
        result = result.replace(new RegExp(`\\$\\{${i}\\}`, "g"), String(value))
      }
    }
    return result
  } else {
    // Для одного значения заменяем ${0}
    const value = getValueByPath(dataPath, params)
    return expr.replace(/\$\{0\}/g, String(value))
  }
}
