import type { ExtractValues, Update } from "../../context/index.t"
import type { ContextSchema } from "../../context/types.t.ts"
import type { Core } from "../../index.t.ts"
import type { Node, NodeElement, NodeText, NodeMap } from "@zavx0z/html-parser"

type RenderParams = { context: any; core: any; state: string; development?: boolean }

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
])

const isVoidTag = (name: string) => VOID_TAGS.has(name.toLowerCase())

/** Разрешаем динамический тег ТОЛЬКО если он meta-* (акторы). Иначе — ошибка в dev и fallback в 'div' в prod. */
function resolveActorTagName(
  tag: string | { value?: any; data?: string | string[]; expr?: string },
  params: RenderParams,
  item?: any,
  parentItem?: any
): string {
  // статический — просто вернуть (но проверим правила кастомных элементов)
  if (typeof tag === "string") return tag

  // если "динамический" — вычисляем значение
  let resolved = ""
  if (tag?.value != null) {
    resolved = String(tag.value ?? "")
  } else if (tag?.data != null) {
    const raw =
      item === undefined
        ? getNestedValue(tag.data as string, params)
        : getNestedValueWithItem(tag.data as string, item, parentItem, params)
    resolved =
      tag.expr != null
        ? String(
            item === undefined
              ? evaluateExpression(tag.expr as string, tag.data as string | string[], params)
              : evaluateExpressionWithItem(tag.expr as string, tag.data as string | string[], item, parentItem, params)
          )
        : String(raw ?? "")
  }

  const name = (resolved || "").trim().toLowerCase()

  // Разрешаем только meta-*
  const ok = name.startsWith("meta-")
  if (!ok) {
    if (params.development) {
      console.error(`[render] Dynamic tag is forbidden for non-actors: "${name}". Only "meta-*" allowed.`)
    }
    return "div"
  }

  // "meta" — void-тег HTML, а "meta-..." — обычный кастомный элемент (не void)
  // Нормализуем: имя должно содержать дефис и начинаться с буквы
  if (!/^[a-z][a-z0-9.-]*-[a-z0-9.-]+$/.test(name)) {
    if (params.development) {
      console.error(`[render] Invalid custom element name: "${name}"`)
    }
    return "div"
  }

  return name
}

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
 * Преобразует значение в валидный токен класса
 */
function stringifyClassToken(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "boolean") return "" // булево в класс не пускаем
  const s = String(v).trim()
  // отсечём мусорные представления объектов/массивов
  if (s === "" || s === "[object Object]" || s === "[object Array]") return ""
  return s
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
    case "meta":
      return renderMeta(node, params)
    default:
      return null
  }
}

/**
 * Рендерит meta элемент
 */
function renderMeta<C extends ContextSchema>(
  node: any,
  params: {
    state: string
    context: ExtractValues<C>
    core: Record<string, any>
    update: Update<C>
  }
): HTMLElement {
  const tagName = resolveActorTagName(node.tag, params)
  const element = document.createElement(tagName)

  // Добавляем строковые атрибуты
  if (node.string) {
    for (const [key, value] of Object.entries(node.string)) {
      if (typeof value === "object" && value !== null) {
        // Динамический атрибут
        if ("data" in value && "expr" in value) {
          // Атрибут с выражением
          const attrValue = evaluateExpression(value.expr as string, value.data as string | string[], params)
          element.setAttribute(key, String(attrValue))
        } else if ("data" in value) {
          // Простой динамический атрибут
          const attrValue = getValueByPath(value.data as string | string[], params)
          element.setAttribute(key, String(attrValue))
        }
      } else {
        // Статический атрибут
        element.setAttribute(key, String(value))
      }
    }
  }

  // Обрабатываем объектные атрибуты (context, core)
  let contextData: any = null
  let coreData: any = null

  // Проверяем атрибут context как отдельное поле узла
  if ((node as any).context) {
    const contextValue = (node as any).context
    if (typeof contextValue === "object" && contextValue !== null) {
      if ("data" in contextValue && "expr" in contextValue) {
        // Атрибут с выражением
        contextData = evaluateExpression(contextValue.expr as string, contextValue.data as string | string[], params)
      } else if ("data" in contextValue) {
        // Простой динамический атрибут
        contextData = getValueByPath(contextValue.data as string | string[], params)
      }
    }
  }

  // Проверяем атрибут core как отдельное поле узла
  if ((node as any).core) {
    const coreValue = (node as any).core
    if (typeof coreValue === "object" && coreValue !== null) {
      if ("data" in coreValue && "expr" in coreValue) {
        // Атрибут с выражением
        coreData = evaluateExpression(coreValue.expr as string, coreValue.data as string | string[], params)
      } else if ("data" in coreValue) {
        // Простой динамический атрибут
        coreData = getValueByPath(coreValue.data as string | string[], params)
      }
    }
  }

  // Если есть данные контекста, устанавливаем их через update метод актора
  if (contextData && typeof (element as any).update === "function") {
    ;(element as any).update(contextData)
  }

  // Если есть данные core, устанавливаем их через __updCore метод актора
  if (coreData && typeof (element as any).__updCore === "function") {
    ;(element as any).__updCore(coreData)
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
  const tagName = resolveActorTagName(node.tag, params)
  const element = document.createElement(tagName)

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
          const token = stringifyClassToken(value)
          if (token) classValues.push(token)
        } else if (typeof value === "object" && value !== null) {
          if ("value" in value) {
            // Статический атрибут
            const token = stringifyClassToken(value.value)
            if (token) classValues.push(token)
          } else if ("data" in value) {
            // Динамический атрибут
            const attrValue = getValueByPath(value.data, params)
            if (attrValue != null && attrValue !== "") {
              if ("expr" in value) {
                // Атрибут с выражением
                const exprValue = evaluateExpression(value.expr, value.data, params)
                const token = stringifyClassToken(exprValue)
                if (token) classValues.push(token)
              } else {
                const token = stringifyClassToken(attrValue)
                if (token) classValues.push(token)
              }
            }
          }
        }
      }

      if (classValues.length > 0) {
        // Дедупликация токенов с сохранением порядка
        const uniqueTokens = Array.from(new Set(classValues))
        const existingClass = element.getAttribute("class") || ""
        const newClass = [existingClass, ...uniqueTokens].filter(Boolean).join(" ")
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
    for (let index = 0; index < array.length; index++) {
      const item = array[index]
      for (const childNode of node.child) {
        const childElement = renderNodeWithItem(childNode, params, item, undefined, [{ item, index }])
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
  itemStack: Array<{ item: any; index: number }> = []
): DocumentFragment {
  const fragment = document.createDocumentFragment()

  // Получаем массив данных из элемента
  const array = getNestedValueWithItem(node.data, item, parentItem, params, itemStack)

  if (Array.isArray(array)) {
    // Рендерим каждый элемент массива
    for (let index = 0; index < array.length; index++) {
      const subItem = array[index]
      const newStack = [...itemStack, { item, index }]
      // Собираем цепочку предков для поддержки многоуровневых относительных путей
      const parentChain = Array.isArray(parentItem) ? [item, ...parentItem] : parentItem ? [item, parentItem] : [item]
      for (const childNode of node.child) {
        const childElement = renderNodeWithItem(childNode, params, subItem, parentChain, newStack)
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
  itemStack: Array<{ item: any; index: number }> = []
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
  itemStack: Array<{ item: any; index: number }> = []
): HTMLElement {
  const tagName = resolveActorTagName(node.tag, params, item, parentItem)
  const element = document.createElement(tagName)

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
          const token = stringifyClassToken(value)
          if (token) classValues.push(token)
        } else if (typeof value === "object" && value !== null) {
          if ("value" in value) {
            // Статический атрибут
            const token = stringifyClassToken(value.value)
            if (token) classValues.push(token)
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
                const token = stringifyClassToken(exprValue)
                if (token) classValues.push(token)
              } else {
                const token = stringifyClassToken(attrValue)
                if (token) classValues.push(token)
              }
            }
          }
        }
      }

      if (classValues.length > 0) {
        // Дедупликация токенов с сохранением порядка
        const uniqueTokens = Array.from(new Set(classValues))
        const existingClass = element.getAttribute("class") || ""
        const newClass = [existingClass, ...uniqueTokens].filter(Boolean).join(" ")
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
  itemStack: Array<{ item: any; index: number }> = []
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
 * Получает вложенное значение по пути из элемента массива
 */
function getNestedValueWithItem(
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
 * Вычисляет выражение с интерполяцией для элемента массива
 */
function evaluateExpressionWithItem(
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
        // Для core объектов создаем специальную функцию для получения реального объекта
        if (path.startsWith("/core/")) {
          const corePath = path.slice(6) // убираем "/core/"
          result = result.replace(new RegExp(`\\[${i}\\]`, "g"), `(() => { return params.core.${corePath} })()`)
        } else {
          result = result.replace(new RegExp(`\\[${i}\\]`, "g"), JSON.stringify(value))
        }
      }
    }
  } else {
    // Для одного значения заменяем [0]
    const value = getValueByPath(dataPath, params)
    // Для core объектов создаем специальную функцию для получения реального объекта
    if (dataPath.startsWith("/core/")) {
      const corePath = dataPath.slice(6) // убираем "/core/"
      result = result.replace(/\[0\]/g, `(() => { return params.core.${corePath} })()`)
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
    return result
  }
}
