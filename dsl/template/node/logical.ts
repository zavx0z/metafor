import type { PartAttrLogical } from "./logical.t"
import { parseCondition } from "../parser"
import type { ParseContext } from "../parser.t"
import { createNode } from "."
import type { NodeLogical, TokenLogicalOpen } from "./logical.t"

/**
 * Создает NodeLogical из обычного PartLogical.
 */

export const createNodeDataLogical = (
  node: PartAttrLogical,
  context: ParseContext = { pathStack: [], level: 0 }
): NodeLogical => {
  const condData = parseCondition(node.text, context)
  const isSimpleCondition = !Array.isArray(condData.path) || condData.path.length <= 1

  // Используем пути, уже правильно разрешенные в parseCondition
  const processedData = condData.path

  // Проверяем наличие операторов/методов
  const hasOperatorsOrMethods =
    condData.metadata?.expression && /[%+\-*/&&||===!===!=<>().]/.test(condData.metadata.expression)

  const needsExpression = !isSimpleCondition || hasOperatorsOrMethods

  return {
    type: "log",
    data: processedData || (isSimpleCondition ? "" : []),
    ...(needsExpression && condData.metadata?.expression ? { expr: condData.metadata.expression } : {}),
    child: node.child ? node.child.map((child: any) => createNode(child, context)) : [],
  }
}
export const findLogicalOperators = (expr: string): [number, TokenLogicalOpen][] => {
  const results: [number, TokenLogicalOpen][] = []

  // Ищем паттерн: ${condition && html`...`}
  // Это более специфичный поиск для логических операторов с html шаблонами
  let i = 0
  while (i < expr.length) {
    const dollarIndex = expr.indexOf("${", i)
    if (dollarIndex === -1) break

    // Ищем && после переменной или выражения
    const andIndex = expr.indexOf("&&", dollarIndex + 2)
    if (andIndex === -1) {
      i = dollarIndex + 2
      continue
    }

    // Проверяем, что после && идет html` (а не тернарный оператор)
    const htmlIndex = expr.indexOf("html`", andIndex + 2)
    const ternaryIndex = expr.indexOf("?", andIndex + 2)

    // Если есть тернарный оператор раньше html`, то это не логический оператор
    if (ternaryIndex !== -1 && (htmlIndex === -1 || ternaryIndex < htmlIndex)) {
      i = andIndex + 2
      continue
    }

    if (htmlIndex === -1) {
      i = andIndex + 2
      continue
    }

    // Извлекаем полное выражение до html` (включая все &&)
    const fullCondition = expr.slice(dollarIndex + 2, htmlIndex).trim()

    // Убираем последний && если он есть
    const condition = fullCondition.replace(/\s*&&\s*$/, "").trim()

    // Проверяем, что это валидное условие (содержит переменную или сложное выражение)
    if (condition && /[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*/.test(condition)) {
      results.push([dollarIndex + 2, { kind: "log-open", expr: condition }])
    }

    i = htmlIndex + 5 // Переходим к концу html`
  }

  return results
}
