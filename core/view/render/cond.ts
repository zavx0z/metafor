import type { Values, Update, Schema } from "@zavx0z/context"
import { getValueByPath, evaluateExpression, getValueByPathWithItem, evaluateExpressionWithItem } from "./utils.ts"
import { renderNode, renderNodeWithItem } from "./index.ts"

/**
 * Рендерит условный блок
 */
export function renderCondition<C extends Schema>(
  node: any,
  params: {
    state: string
    context: Values<C>
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
  // Согласно документации парсера, child[0] - это ветка true, child[1] - ветка false
  const branchIndex = condition ? 0 : 1
  const branchNode = node.child && node.child[branchIndex]

  if (!branchNode) {
    return null
  }

  // Рендерим выбранную ветку
  return renderNode(branchNode, params)
}

/**
 * Рендерит условный блок с контекстом элемента массива
 */
export function renderConditionWithItem<C extends Schema>(
  node: any,
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
  // Согласно документации парсера, child[0] - это ветка true, child[1] - ветка false
  const branchIndex = condition ? 0 : 1
  const branchNode = node.child && node.child[branchIndex]

  if (!branchNode) {
    return null
  }

  // Рендерим выбранную ветку
  return renderNodeWithItem(branchNode, params, item, parentItem, itemStack)
}

/**
 * Рендерит логический узел (&&, ||)
 */
export function renderLog<C extends Schema>(
  node: any,
  params: {
    state: string
    context: Values<C>
    core: Record<string, any>
    update: Update<C>
  }
): HTMLElement | Text | DocumentFragment | null {
  // Для логических операторов проверяем условие
  const value = getValueByPath(node.data, params)
  const condition = Boolean(value)

  // Определяем тип оператора по наличию expr или другим признакам
  // Если есть expr, это может быть || оператор
  const isOrOperator = node.expr && node.expr.includes("||")

  if (isOrOperator) {
    // Для || оператора: если условие truthy, рендерим значение, иначе fallback
    if (condition) {
      // Рендерим значение условия как текст
      return document.createTextNode(String(value))
    } else {
      // Рендерим fallback (child[0])
      if (node.child && node.child.length > 0) {
        return renderNode(node.child[0], params)
      }
    }
  } else {
    // Для && оператора: если условие true, рендерим дочерний элемент
    if (condition && node.child && node.child.length > 0) {
      return renderNode(node.child[0], params)
    }
  }

  return null
}

/**
 * Рендерит логический узел с контекстом элемента массива
 */
export function renderLogWithItem<C extends Schema>(
  node: any,
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
  // Для логических операторов проверяем условие
  const value = getValueByPathWithItem(node.data, item, parentItem, params, itemStack)
  const condition = Boolean(value)

  // Определяем тип оператора по наличию expr или другим признакам
  // Если есть expr, это может быть || оператор
  const isOrOperator = node.expr && node.expr.includes("||")

  if (isOrOperator) {
    // Для || оператора: если условие truthy, рендерим значение, иначе fallback
    if (condition) {
      // Рендерим значение условия как текст
      return document.createTextNode(String(value))
    } else {
      // Рендерим fallback (child[0])
      if (node.child && node.child.length > 0) {
        return renderNodeWithItem(node.child[0], params, item, parentItem, itemStack)
      }
    }
  } else {
    // Для && оператора: если условие true, рендерим дочерний элемент
    if (condition && node.child && node.child.length > 0) {
      return renderNodeWithItem(node.child[0], params, item, parentItem, itemStack)
    }
  }

  return null
}
