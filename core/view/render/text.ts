import type { ExtractValues, Update } from "../../context/index.t"
import type { ContextSchema } from "../../context/types.t.ts"
import type { NodeText } from "@zavx0z/html-parser"
import { getValueByPath, evaluateExpression, getValueByPathWithItem, evaluateExpressionWithItem } from "./utils.ts"

/**
 * Рендерит текстовый узел
 */
export function renderText<C extends ContextSchema>(
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
 * Рендерит текстовый узел с контекстом элемента массива
 */
export function renderTextWithItem<C extends ContextSchema>(
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
