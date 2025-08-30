import type { ExtractValues, Update } from "../../context/index.t"
import type { ContextSchema } from "../../context/types.t.ts"
import {
  getValueByPath,
  evaluateExpression,
  getNestedValueWithItem,
  evaluateExpressionWithItem,
  getValueByPathWithItem,
} from "./utils.ts"
import { renderNode, renderNodeWithItem } from "./index.ts"
import { resolveActorTagName } from "./shared.ts"

/**
 * Рендерит meta элемент
 */
export function renderMeta<C extends ContextSchema>(
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
 * Рендерит meta элемент с контекстом элемента массива
 */
export function renderMetaWithItem<C extends ContextSchema>(
  node: any,
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
          const attrValue = evaluateExpressionWithItem(
            value.expr as string,
            value.data as string | string[],
            item,
            parentItem,
            params,
            itemStack
          )
          element.setAttribute(key, String(attrValue))
        } else if ("data" in value) {
          // Простой динамический атрибут
          const attrValue = getValueByPathWithItem(value.data as string | string[], item, parentItem, params, itemStack)
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
        contextData = evaluateExpressionWithItem(
          contextValue.expr as string,
          contextValue.data as string | string[],
          item,
          parentItem,
          params,
          itemStack
        )
      } else if ("data" in contextValue) {
        // Простой динамический атрибут
        contextData = getValueByPathWithItem(
          contextValue.data as string | string[],
          item,
          parentItem,
          params,
          itemStack
        )
      }
    }
  }

  // Проверяем атрибут core как отдельное поле узла
  if ((node as any).core) {
    const coreValue = (node as any).core
    if (typeof coreValue === "object" && coreValue !== null) {
      if ("data" in coreValue && "expr" in coreValue) {
        // Атрибут с выражением
        coreData = evaluateExpressionWithItem(
          coreValue.expr as string,
          coreValue.data as string | string[],
          item,
          parentItem,
          params,
          itemStack
        )
      } else if ("data" in coreValue) {
        // Простой динамический атрибут
        coreData = getValueByPathWithItem(coreValue.data as string | string[], item, parentItem, params, itemStack)
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
