import type { Values, Update, Schema } from "@zavx0z/context"
import type { Core } from "../../index.t.ts"
import type { Node, NodeElement, NodeText, NodeMap } from "@zavx0z/template"
import { renderElement, renderElementWithItem } from "./element.ts"
import { renderText, renderTextWithItem } from "./text.ts"
import { renderMap, renderMapWithItem } from "./map.ts"
import { renderMeta, renderMetaWithItem } from "./meta.ts"
import { renderCondition, renderConditionWithItem, renderLog, renderLogWithItem } from "./cond.ts"

/**
 * Основная функция рендеринга
 */
export function render<C extends Schema, S extends string, I extends Core>({
  state,
  context,
  core,
  container,
  update,
  schema,
}: {
  state: S
  context: Values<C>
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
export function renderNode<C extends Schema>(
  node: Node,
  params: {
    state: string
    context: Values<C>
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
    case "cond":
      return renderCondition(node, params)
    case "log":
      return renderLog(node, params)
    default:
      return null
  }
}

/**
 * Рендерит отдельный узел с контекстом элемента массива
 */
export function renderNodeWithItem<C extends Schema>(
  node: Node,
  params: {
    state: string
    context: Values<C>
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
    case "meta":
      return renderMetaWithItem(node, params, item, parentItem, itemStack)
    case "cond":
      return renderConditionWithItem(node, params, item, parentItem, itemStack)
    case "log":
      return renderLogWithItem(node, params, item, parentItem, itemStack)
    default:
      return null
  }
}
