import type { PartAttrCondition } from "./condition.t"
import { parseCondition } from "../parser"
import type { ParseContext } from "../parser.t"
import type { NodeCondition, TokenCondClose, TokenCondElse, TokenCondOpen } from "./condition.t"
import { createNode } from "."

/**
 * Создает NodeCondition из PartCondition.
 */
export const createNodeDataCondition = (
  node: PartAttrCondition,
  context: ParseContext = { pathStack: [], level: 0 }
): NodeCondition => {
  const condData = parseCondition(node.text, context)
  const isSimpleCondition = !Array.isArray(condData.path) || condData.path.length === 1

  // Используем пути, уже правильно разрешенные в parseCondition
  const processedData = condData.path

  // Проверяем наличие операторов/методов
  const hasOperatorsOrMethods =
    condData.metadata?.expression && /[%+\-*/&&||===!===!=<>().]/.test(condData.metadata.expression)

  const needsExpression = !isSimpleCondition || hasOperatorsOrMethods

  return {
    type: "cond",
    data: isSimpleCondition
      ? Array.isArray(processedData)
        ? processedData[0] || ""
        : processedData || ""
      : processedData || [],
    ...(needsExpression && condData.metadata?.expression ? { expr: condData.metadata.expression } : {}),
    child: [createNode(node.child[0]!, context), createNode(node.child[1]!, context)],
  }
}

export const findCondElse = (expr: string): [number, TokenCondElse] | undefined => {
  const condElseRegex = /:\s*/g // допускаем произвольные пробелы/переводы строк
  let match
  while ((match = condElseRegex.exec(expr)) !== null) {
    return [match.index, { kind: "cond-else" }]
  }
}

export const findAllConditions = (expr: string): [number, TokenCondOpen][] => {
  // Ищем все условия (включая вложенные)
  const results: [number, TokenCondOpen][] = []

  // Сначала ищем первое условие (после ${ или =>)
  let i = 0
  while (i < expr.length) {
    const d = expr.indexOf("${", i)
    const a = expr.indexOf("=>", i)
    if (d === -1 && a === -1) break

    const useDollar = d !== -1 && (a === -1 || d < a)
    const start = useDollar ? d : a
    let j = start + 2
    while (j < expr.length && /\s/.test(expr[j]!)) j++

    const q = expr.indexOf("?", j)
    if (q === -1) {
      i = j + 1
      continue
    }

    const between = expr.slice(j, q)

    // если это ветка "=>", и до '?' попался backtick, то это тегированный шаблон:
    // переносим курсор на сам backtick и ищем следующий кандидат (внутренний ${ ... ? ... }).
    if (!useDollar) {
      const bt = between.indexOf("`")
      if (bt !== -1) {
        i = j + bt + 1
        continue
      }
    }

    // если это ветка "${", и до '?' попался .map( — пропускаем внешний map-кандидат
    // и двигаемся внутрь.
    if (useDollar) {
      const m = between.indexOf(".map(")
      if (m !== -1) {
        i = j + m + 1
        continue
      }
      // защитно: если внутри выражения внезапно встретился backtick — тоже двигаемся к нему
      const bt = between.indexOf("`")
      if (bt !== -1) {
        i = j + bt + 1
        continue
      }
    }

    results.push([j, { kind: "cond-open", expr: between.trim() }])
    i = q + 1
  }

  // Затем ищем все вложенные условия вида: ? ... ? или : ... ?
  i = 0
  while (i < expr.length) {
    const questionMark = expr.indexOf("?", i)
    const colon = expr.indexOf(":", i)

    if (questionMark === -1 && colon === -1) break

    // Выбираем ближайший символ
    const useQuestion = questionMark !== -1 && (colon === -1 || questionMark < colon)
    const pos = useQuestion ? questionMark : colon

    // Ищем следующий ? или : после текущего
    const nextQuestion = expr.indexOf("?", pos + 1)
    const nextColon = expr.indexOf(":", pos + 1)

    if (nextQuestion === -1 && nextColon === -1) break

    // Выбираем ближайший следующий символ
    const useNextQuestion = nextQuestion !== -1 && (nextColon === -1 || nextQuestion < nextColon)
    const nextPos = useNextQuestion ? nextQuestion : nextColon

    // Извлекаем условие между текущим и следующим символом
    const condition = expr.slice(pos + 1, nextPos).trim()

    // Проверяем, что это не пустое условие и не содержит html`
    if (condition && !condition.includes("html`")) {
      results.push([pos + 1, { kind: "cond-open", expr: condition }])
    }

    // Продолжаем поиск с позиции после текущего символа
    i = pos + 1
  }

  return results
}

export const findCondClose = (expr: string): [number, TokenCondClose] | undefined => {
  // Ищем } которая НЕ является частью деструктуризации в параметрах функции
  // Исключаем случаи типа ({ title }) => или (({ title })) =>
  const condCloseRegex = /[^\)]}(?!\s*\)\s*=>)/g
  let match
  while ((match = condCloseRegex.exec(expr)) !== null) {
    return [match.index, { kind: "cond-close" }]
  }
}
