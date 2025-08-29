import type { ExtractValues, Update } from "../../context/index.t"
import type { ContextSchema } from "../../context/types.t.ts"
import type { Core } from "../../index.t.ts"
import type { Node, NodeElement, NodeText, NodeMap } from "@zavx0z/html-parser"

/**
 * Преобразует значение в boolean с учетом строковых "ложных" значений
 */
function toBoolean(value: any): boolean {
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

  // Добавляем строковые атрибуты
  if (node.string) {
    for (const [key, value] of Object.entries(node.string)) {
      if (typeof value === "object" && value !== null) {
        // Динамический атрибут
        if ("data" in value && "expr" in value) {
          // Атрибут с выражением
          const attrValue = evaluateExpression(value.expr, value.data, params)
          element.setAttribute(key, String(attrValue))
        } else if ("data" in value) {
          // Простой динамический атрибут
          const attrValue = getValueByPath(value.data, params)
          element.setAttribute(key, String(attrValue))
        }
      } else {
        // Статический атрибут
        element.setAttribute(key, String(value))
      }
    }
  }

  // Добавляем булевы атрибуты
  if (node.boolean) {
    // Сначала обрабатываем взаимоисключающие атрибуты
    const visibleAttrs = ["visible", "hidden"]
    const hasVisibleConflict = visibleAttrs.some((attr) => node.boolean && attr in node.boolean)

    if (hasVisibleConflict) {
      // Если есть конфликт visible/hidden, обрабатываем их специально
      const visibleValue = node.boolean.visible
      const hiddenValue = node.boolean.hidden

      if (visibleValue && typeof visibleValue === "object" && "data" in visibleValue) {
        const isVisible = getValueByPath(visibleValue.data, params)
        if (isVisible) {
          element.setAttribute("visible", "")
          element.removeAttribute("hidden")
        } else {
          element.removeAttribute("visible")
          element.setAttribute("hidden", "")
        }
      } else if (hiddenValue && typeof hiddenValue === "object" && "data" in hiddenValue && "expr" in hiddenValue) {
        const isHidden = toBoolean(evaluateExpression(hiddenValue.expr, hiddenValue.data, params))
        if (isHidden) {
          element.setAttribute("hidden", "")
          element.removeAttribute("visible")
        } else {
          element.removeAttribute("hidden")
          element.setAttribute("visible", "")
        }
      }
    }

    // Обрабатываем остальные булевы атрибуты
    for (const [key, value] of Object.entries(node.boolean)) {
      if (visibleAttrs.includes(key)) continue // Пропускаем уже обработанные

      if (typeof value === "object" && value !== null) {
        // Динамический булев атрибут
        if ("data" in value && "expr" in value) {
          // Атрибут с выражением
          const boolValue = toBoolean(evaluateExpression(value.expr, value.data, params))
          if (boolValue) {
            element.setAttribute(key, "")
          } else {
            element.removeAttribute(key)
          }
        } else if ("data" in value) {
          // Простой динамический булев атрибут
          const boolValue = getValueByPath(value.data, params)
          if (boolValue) {
            element.setAttribute(key, "")
          } else {
            element.removeAttribute(key)
          }
        }
      } else if (value === true) {
        // Проверяем, не установлен ли уже этот атрибут как строковый
        if (!node.string || !(key in node.string)) {
          element.setAttribute(key, "")
        }
      } else if (value === false) {
        element.removeAttribute(key)
      }
    }
  }

  // Добавляем списковые атрибуты
  if (node.array) {
    // Специальная обработка для class атрибута
    if (node.array.class) {
      const classValues: string[] = []

      for (const value of node.array.class) {
        if (typeof value === "string") {
          classValues.push(value)
        } else if (typeof value === "object" && value !== null) {
          if ("value" in value) {
            // Статический атрибут
            if (value.value) classValues.push(String(value.value))
          } else if ("data" in value) {
            // Динамический атрибут
            const attrValue = getValueByPath(value.data, params)
            if (attrValue != null && attrValue !== "") {
              if ("expr" in value) {
                // Атрибут с выражением
                const exprValue = evaluateExpression(value.expr, value.data, params)
                if (exprValue != null && exprValue !== "") classValues.push(String(exprValue))
              } else {
                classValues.push(String(attrValue))
              }
            }
          }
        }
      }

      if (classValues.length > 0) {
        const existingClass = element.getAttribute("class") || ""
        const newClass = [existingClass, ...classValues].filter(Boolean).join(" ")
        element.setAttribute("class", newClass)
      }
    }

    // Обработка остальных array атрибутов
    for (const [key, values] of Object.entries(node.array)) {
      if (key === "class") continue // Уже обработали

      const attrValues: string[] = []

      for (const value of values) {
        if (typeof value === "object" && value !== null) {
          if ("data" in value && "expr" in value) {
            // Атрибут с выражением
            const attrValue = evaluateExpression(value.expr, value.data, params)
            attrValues.push(String(attrValue))
          } else if ("data" in value) {
            // Простой динамический атрибут
            const attrValue = getValueByPath(value.data, params)
            attrValues.push(String(attrValue))
          } else if ("value" in value) {
            // Статический атрибут
            attrValues.push(value.value)
          }
        }
      }

      if (attrValues.length > 0) {
        element.setAttribute(key, attrValues.join(" "))
      }
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
        const childElement = renderNodeWithItem(childNode, params, item, undefined, [item])
        if (childElement) {
          if (childElement instanceof DocumentFragment) {
            // Для DocumentFragment добавляем все дочерние элементы
            while (childElement.firstChild) {
              fragment.appendChild(childElement.firstChild)
            }
          } else {
            fragment.appendChild(childElement)
          }
        }
      }
    }
  }

  return fragment
}

/**
 * Рендерит map узел с контекстом элемента массива
 */
function renderMapWithItem<C extends ContextSchema>(
  node: NodeMap,
  params: {
    state: string
    context: ExtractValues<C>
    core: Record<string, any>
    update: Update<C>
  },
  item: any,
  parentItem?: any,
  itemStack: any[] = []
): DocumentFragment {
  const fragment = document.createDocumentFragment()

  // Получаем массив данных из элемента
  const array = getNestedValueWithItem(node.data, item, parentItem, params, itemStack)

  if (Array.isArray(array)) {
    // Рендерим каждый элемент массива
    for (const subItem of array) {
      const newStack = [...itemStack, item]
      for (const childNode of node.child) {
        const childElement = renderNodeWithItem(childNode, params, subItem, item, newStack)
        if (childElement) {
          if (childElement instanceof DocumentFragment) {
            // Для DocumentFragment добавляем все дочерние элементы
            while (childElement.firstChild) {
              fragment.appendChild(childElement.firstChild)
            }
          } else {
            fragment.appendChild(childElement)
          }
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
  item: any,
  parentItem?: any,
  itemStack: any[] = []
): HTMLElement | Text | DocumentFragment | null {
  switch (node.type) {
    case "el":
      return renderElementWithItem(node as NodeElement, params, item, parentItem, itemStack)
    case "text":
      return renderTextWithItem(node as NodeText, params, item, parentItem, itemStack)
    case "map":
      return renderMapWithItem(node as NodeMap, params, item, parentItem, itemStack)
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
  item: any,
  parentItem?: any,
  itemStack: any[] = []
): HTMLElement {
  const element = document.createElement(node.tag)

  // Добавляем строковые атрибуты
  if (node.string) {
    for (const [key, value] of Object.entries(node.string)) {
      if (typeof value === "object" && value !== null) {
        // Динамический атрибут
        if ("data" in value && "expr" in value) {
          // Атрибут с выражением
          const attrValue = evaluateExpressionWithItem(value.expr, value.data, item, parentItem, params, itemStack)
          element.setAttribute(key, String(attrValue))
        } else if ("data" in value) {
          // Простой динамический атрибут
          const attrValue = getValueByPathWithItem(value.data, item, parentItem, params, itemStack)
          element.setAttribute(key, String(attrValue))
        }
      } else {
        // Статический атрибут
        element.setAttribute(key, String(value))
      }
    }
  }

  // Добавляем булевы атрибуты
  if (node.boolean) {
    // Сначала обрабатываем взаимоисключающие атрибуты
    const visibleAttrs = ["visible", "hidden"]
    const hasVisibleConflict = visibleAttrs.some((attr) => node.boolean && attr in node.boolean)

    if (hasVisibleConflict) {
      // Если есть конфликт visible/hidden, обрабатываем их специально
      const visibleValue = node.boolean.visible
      const hiddenValue = node.boolean.hidden

      if (visibleValue && typeof visibleValue === "object" && "data" in visibleValue) {
        const isVisible = getValueByPathWithItem(visibleValue.data, item, parentItem, params, itemStack)
        if (isVisible) {
          element.setAttribute("visible", "")
          element.removeAttribute("hidden")
        } else {
          element.removeAttribute("visible")
          element.setAttribute("hidden", "")
        }
      } else if (hiddenValue && typeof hiddenValue === "object" && "data" in hiddenValue && "expr" in hiddenValue) {
        const isHidden = toBoolean(
          evaluateExpressionWithItem(hiddenValue.expr, hiddenValue.data, item, parentItem, params, itemStack)
        )
        if (isHidden) {
          element.setAttribute("hidden", "")
          element.removeAttribute("visible")
        } else {
          element.removeAttribute("hidden")
          element.setAttribute("visible", "")
        }
      }
    }

    // Обрабатываем остальные булевы атрибуты
    for (const [key, value] of Object.entries(node.boolean)) {
      if (visibleAttrs.includes(key)) continue // Пропускаем уже обработанные

      if (typeof value === "object" && value !== null) {
        // Динамический булев атрибут
        if ("data" in value && "expr" in value) {
          // Атрибут с выражением
          const boolValue = toBoolean(
            evaluateExpressionWithItem(value.expr, value.data, item, parentItem, params, itemStack)
          )
          if (boolValue) {
            element.setAttribute(key, "")
          } else {
            element.removeAttribute(key)
          }
        } else if ("data" in value) {
          // Простой динамический булев атрибут
          const boolValue = getValueByPathWithItem(value.data, item, parentItem, params, itemStack)
          if (boolValue) {
            element.setAttribute(key, "")
          } else {
            element.removeAttribute(key)
          }
        }
      } else if (value === true) {
        // Проверяем, не установлен ли уже этот атрибут как строковый
        if (!node.string || !(key in node.string)) {
          element.setAttribute(key, "")
        }
      } else if (value === false) {
        element.removeAttribute(key)
      }
    }
  }

  // Добавляем списковые атрибуты
  if (node.array) {
    // Специальная обработка для class атрибута
    if (node.array.class) {
      const classValues: string[] = []

      for (const value of node.array.class) {
        if (typeof value === "string") {
          classValues.push(value)
        } else if (typeof value === "object" && value !== null) {
          if ("value" in value) {
            // Статический атрибут
            if (value.value) classValues.push(String(value.value))
          } else if ("data" in value) {
            // Динамический атрибут
            const attrValue = getValueByPathWithItem(value.data, item, parentItem, params, itemStack)
            if (attrValue != null && attrValue !== "") {
              if ("expr" in value) {
                // Атрибут с выражением
                const exprValue = evaluateExpressionWithItem(
                  value.expr,
                  value.data,
                  item,
                  parentItem,
                  params,
                  itemStack
                )
                if (exprValue != null && exprValue !== "") classValues.push(String(exprValue))
              } else {
                classValues.push(String(attrValue))
              }
            }
          }
        }
      }

      if (classValues.length > 0) {
        const existingClass = element.getAttribute("class") || ""
        const newClass = [existingClass, ...classValues].filter(Boolean).join(" ")
        element.setAttribute("class", newClass)
      }
    }

    // Обработка остальных array атрибутов
    for (const [key, values] of Object.entries(node.array)) {
      if (key === "class") continue // Уже обработали

      const attrValues: string[] = []

      for (const value of values) {
        if (typeof value === "object" && value !== null) {
          if ("data" in value && "expr" in value) {
            // Атрибут с выражением
            const attrValue = evaluateExpressionWithItem(value.expr, value.data, item, parentItem, params, itemStack)
            attrValues.push(String(attrValue))
          } else if ("data" in value) {
            // Простой динамический атрибут
            const attrValue = getValueByPathWithItem(value.data, item, parentItem, params, itemStack)
            attrValues.push(String(attrValue))
          } else if ("value" in value) {
            // Статический атрибут
            attrValues.push(value.value)
          }
        }
      }

      if (attrValues.length > 0) {
        element.setAttribute(key, attrValues.join(" "))
      }
    }
  }

  // Рендерим дочерние элементы
  if (node.child) {
    for (const childNode of node.child) {
      const childElement = renderNodeWithItem(childNode, params, item, parentItem, itemStack)
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
  item: any,
  parentItem?: any,
  itemStack: any[] = []
): Text {
  let text = ""

  if (node.value) {
    // Статический текст
    text = node.value
  } else if (node.data && node.expr) {
    // Смешанный текст с интерполяцией
    text = String(evaluateExpressionWithItem(node.expr, node.data, item, parentItem, params, itemStack))
  } else if (node.data) {
    // Простая интерполяция
    const value = getValueByPathWithItem(node.data, item, parentItem, params, itemStack)
    text = String(value)
  }

  return document.createTextNode(text)
}

/**
 * Получает значение по пути из элемента массива
 */
function getValueByPathWithItem(
  path: string | string[],
  item: any,
  parentItem?: any,
  params?: any,
  itemStack: any[] = []
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
 * Получает вложенное значение по пути из элемента массива
 */
function getNestedValueWithItem(path: string, item: any, parentItem?: any, params?: any, itemStack: any[] = []): any {
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
  let depth = 0
  let cleanPath = path
  while (cleanPath.startsWith("../")) {
    depth++
    cleanPath = cleanPath.slice(3)
  }

  if (depth > 0) {
    // Используем стек элементов для многоуровневых относительных путей
    if (itemStack.length >= depth) {
      const targetItem = itemStack[itemStack.length - depth]
      if (targetItem) {
        // Убираем префикс "[item]" если есть в целевом пути
        let targetPath = cleanPath
        if (targetPath.startsWith("[item]")) {
          targetPath = targetPath.slice(6)
        }

        // Разбиваем путь на части и получаем значение
        const parts = targetPath.split("/").filter(Boolean)
        let current = targetItem
        for (const part of parts) {
          if (current === null || current === undefined) {
            return undefined
          }
          current = current[part]
        }
        return current
      }
    }
    return undefined
  }

  // Убираем префикс "[item]" если есть
  if (cleanPath.startsWith("[item]")) {
    cleanPath = cleanPath.slice(6)
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
function evaluateExpressionWithItem(
  expr: string,
  dataPath: string | string[],
  item: any,
  parentItem?: any,
  params?: any,
  itemStack: any[] = []
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
    text = String(evaluateExpression(node.expr, node.data, params))
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
): any {
  let result = expr

  if (Array.isArray(dataPath)) {
    // Для множественных значений заменяем [0], [1], [2] и т.д.
    for (let i = 0; i < dataPath.length; i++) {
      const path = dataPath[i]
      if (path) {
        const value = getNestedValue(path, params)
        result = result.replace(new RegExp(`\\[${i}\\]`, "g"), JSON.stringify(value))
      }
    }
  } else {
    // Для одного значения заменяем [0]
    const value = getValueByPath(dataPath, params)
    result = result.replace(/\[0\]/g, JSON.stringify(value))
  }

  try {
    // Если выражение содержит шаблонный литерал, обрабатываем его как шаблонную строку
    if (result.includes("${") && !result.startsWith("`")) {
      // Превращаем в шаблонный литерал
      const templateResult = "`" + result + "`"
      const evalResult = Function(`"use strict"; return ${templateResult}`)()
      return evalResult
    } else {
      // Выполняем JavaScript выражение
      const evalResult = Function(`"use strict"; return (${result})`)()
      return evalResult
    }
  } catch (error) {
    console.warn("Failed to evaluate expression:", result, error)
    return result
  }
}
