import type { Values, Update, Schema } from "@zavx0z/context"
import type { NodeMap } from "@zavx0z/html-parser"
import { getNestedValue, getNestedValueWithItem } from "./utils.ts"
import { renderNodeWithItem } from "./index.ts"

/**
 * Рендерит map узел
 */
export function renderMap<C extends Schema>(
  node: NodeMap,
  params: {
    state: string
    context: Values<C>
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
export function renderMapWithItem<C extends Schema>(
  node: NodeMap,
  params: {
    state: string
    context: Values<C>
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
