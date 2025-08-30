import type { ExtractValues, Update } from "../../context/index.t"
import type { ContextSchema } from "../../context/types.t.ts"
import type { NodeElement } from "@zavx0z/html-parser"
import { renderNode, renderNodeWithItem } from "./index.ts"
import { resolveActorTagName, renderElementAttributes } from "./shared.ts"

/**
 * Рендерит HTML элемент
 */
export function renderElement<C extends ContextSchema>(
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

  // Рендерим атрибуты
  renderElementAttributes(element, node, params)

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
 * Рендерит HTML элемент с контекстом элемента массива
 */
export function renderElementWithItem<C extends ContextSchema>(
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

  // Рендерим атрибуты
  renderElementAttributes(element, node, params, item, parentItem, itemStack)

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
