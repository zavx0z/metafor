import type { NodeElement } from "@zavx0z/html-parser"
import {
  toBoolean,
  stringifyClassToken,
  getValueByPath,
  evaluateExpression,
  evaluateExpressionWithItem,
} from "./utils.ts"

type RenderParams = { context: any; core: any; state: string; development?: boolean }

/** Разрешаем динамический тег ТОЛЬКО если он meta-* (акторы). Иначе — ошибка в dev и fallback в 'div' в prod. */
export function resolveActorTagName(
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
        ? getValueByPath(tag.data as string, params)
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
 * Рендерит атрибуты элемента (общая логика)
 */
export function renderElementAttributes(
  element: HTMLElement,
  node: NodeElement,
  params: {
    state: string
    context: any
    core: any
  },
  item?: any,
  parentItem?: any,
  itemStack: Array<{ item: any; index: number }> = []
): void {
  // Добавляем строковые атрибуты
  if (node.string) {
    for (const [key, value] of Object.entries(node.string)) {
      if (typeof value === "object" && value !== null) {
        // Динамический атрибут
        if ("data" in value && "expr" in value) {
          // Атрибут с выражением
          const attrValue =
            item === undefined
              ? evaluateExpression(value.expr, value.data, params)
              : evaluateExpressionWithItem(value.expr, value.data, item, parentItem, params, itemStack)
          element.setAttribute(key, String(attrValue))
        } else if ("data" in value) {
          // Простой динамический атрибут
          const attrValue =
            item === undefined
              ? getValueByPath(value.data, params)
              : getNestedValueWithItem(value.data, item, parentItem, params, itemStack)
          element.setAttribute(key, String(attrValue))
        }
      } else {
        // Статический атрибут
        element.setAttribute(key, String(value))
      }
    }
  }

  // Добавляем события
  if (node.event) {
    for (const [key, value] of Object.entries(node.event)) {
      if (typeof value === "object" && value !== null) {
        // Динамическое событие
        if ("data" in value && "expr" in value) {
          // Событие с выражением
          const eventHandler =
            item === undefined
              ? evaluateExpression(value.expr, value.data, params)
              : evaluateExpressionWithItem(value.expr, value.data, item, parentItem, params, itemStack)
          if (typeof eventHandler === "function") {
            element.addEventListener(key.slice(2), eventHandler) // убираем "on" префикс
          }
        } else if ("data" in value) {
          // Простое динамическое событие
          const eventHandler =
            item === undefined
              ? getValueByPath(String(value.data), params)
              : getNestedValueWithItem(String(value.data), item, parentItem, params, itemStack)
          if (typeof eventHandler === "function") {
            element.addEventListener(key.slice(2), eventHandler) // убираем "on" префикс
          }
        }
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
        const isVisible =
          item === undefined
            ? getValueByPath(String(visibleValue.data), params)
            : getNestedValueWithItem(String(visibleValue.data), item, parentItem, params, itemStack)
        if (isVisible) {
          element.setAttribute("visible", "")
          element.removeAttribute("hidden")
        } else {
          element.removeAttribute("visible")
          element.setAttribute("hidden", "")
        }
      } else if (hiddenValue && typeof hiddenValue === "object" && "data" in hiddenValue && "expr" in hiddenValue) {
        const isHidden = toBoolean(
          item === undefined
            ? evaluateExpression(hiddenValue.expr, hiddenValue.data, params)
            : evaluateExpressionWithItem(hiddenValue.expr, hiddenValue.data, item, parentItem, params, itemStack)
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
            item === undefined
              ? evaluateExpression(value.expr, value.data, params)
              : evaluateExpressionWithItem(value.expr, value.data, item, parentItem, params, itemStack)
          )
          if (boolValue) {
            element.setAttribute(key, "")
          } else {
            element.removeAttribute(key)
          }
        } else if ("data" in value) {
          // Простой динамический булев атрибут
          const boolValue =
            item === undefined
              ? getValueByPath(value.data, params)
              : getNestedValueWithItem(value.data, item, parentItem, params, itemStack)
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
            const attrValue =
              item === undefined
                ? getValueByPath(String(value.data), params)
                : getNestedValueWithItem(String(value.data), item, parentItem, params, itemStack)
            if (attrValue != null && attrValue !== "") {
              if ("expr" in value) {
                // Атрибут с выражением
                const exprValue =
                  item === undefined
                    ? evaluateExpression(value.expr, value.data, params)
                    : evaluateExpressionWithItem(value.expr, value.data, item, parentItem, params, itemStack)
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
            const attrValue =
              item === undefined
                ? evaluateExpression(value.expr, value.data, params)
                : evaluateExpressionWithItem(value.expr, value.data, item, parentItem, params, itemStack)
            attrValues.push(String(attrValue))
          } else if ("data" in value) {
            // Простой динамический атрибут
            const attrValue =
              item === undefined
                ? getValueByPath(String(value.data), params)
                : getNestedValueWithItem(String(value.data), item, parentItem, params, itemStack)
            attrValues.push(String(attrValue))
          } else if ("value" in value) {
            // Статический атрибут
            attrValues.push(String((value as any).value))
          }
        }
      }

      if (attrValues.length > 0) {
        element.setAttribute(key, attrValues.join(" "))
      }
    }
  }
}
