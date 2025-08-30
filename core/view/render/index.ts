import type { ExtractValues, Update } from "../../context/index.t"
import type { ContextSchema } from "../../context/types.t.ts"
import type { Core } from "../../index.t.ts"
import type { Node, NodeElement, NodeText, NodeMap } from "@zavx0z/html-parser"
import { renderElement, renderElementWithItem } from "./element.ts"
import { renderText, renderTextWithItem } from "./text.ts"
import { renderMap, renderMapWithItem } from "./map.ts"
import { renderMeta, renderMetaWithItem } from "./meta.ts"
import { renderCondition, renderConditionWithItem } from "./cond.ts"

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
export function renderNode<C extends ContextSchema>(
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
    case "cond":
      return renderCondition(node, params)
    default:
      return null
  }
}

/**
 * Рендерит отдельный узел с контекстом элемента массива
 */
export function renderNodeWithItem<C extends ContextSchema>(
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
    case "meta":
      return renderMetaWithItem(node, params, item, parentItem, itemStack)
    case "cond":
      return renderConditionWithItem(node, params, item, parentItem, itemStack)
    default:
      return null
  }
}
