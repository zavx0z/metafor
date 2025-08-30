import type { ExtractValues, Update } from "../../context/index.t"
import type { ContextSchema } from "../../context/types.t.ts"
import { getValueByPath, evaluateExpression, getValueByPathWithItem, evaluateExpressionWithItem } from "./utils.ts"
import { renderNode, renderNodeWithItem } from "./index.ts"

/**
 * Рендерит условный блок
 */
export function renderCondition<C extends ContextSchema>(
  node: any,
  params: {
    state: string
    context: ExtractValues<C>
    core: Record<string, any>
    update: Update<C>
  }
): HTMLElement | Text | DocumentFragment | null {
  // Определяем условие
  let condition: boolean

  if (node.expr) {
    // Если есть выражение, вычисляем его
    condition = Boolean(evaluateExpression(node.expr, node.data, params))
  } else {
    // Если нет выражения, берем значение по пути
    const value = getValueByPath(node.data, params)
    condition = Boolean(value)
  }

  // Выбираем ветку в зависимости от условия
  const branchNode = condition ? node.true : node.false

  if (!branchNode) {
    return null
  }

  // Рендерим выбранную ветку
  return renderNode(branchNode, params)
}

/**
 * Рендерит условный блок с контекстом элемента массива
 */
export function renderConditionWithItem<C extends ContextSchema>(
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
): HTMLElement | Text | DocumentFragment | null {
  // Определяем условие
  let condition: boolean

  if (node.expr) {
    // Если есть выражение, вычисляем его
    condition = Boolean(evaluateExpressionWithItem(node.expr, node.data, item, parentItem, params, itemStack))
  } else {
    // Если нет выражения, берем значение по пути
    const value = getValueByPathWithItem(node.data, item, parentItem, params, itemStack)
    condition = Boolean(value)
  }

  // Выбираем ветку в зависимости от условия
  const branchNode = condition ? node.true : node.false

  if (!branchNode) {
    return null
  }

  // Рендерим выбранную ветку
  return renderNodeWithItem(branchNode, params, item, parentItem, itemStack)
}
