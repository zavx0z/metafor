import {
  ARGUMENTS_PREFIX,
  CONDITIONAL_OPERATORS_PATTERN,
  OBJECT_KEY_PATTERN,
  resolveDataPath,
  TEMPLATE_WRAPPER_PATTERN,
  UPDATE_OBJECT_PATTERN,
  VARIABLE_WITH_DOTS_PATTERN,
  WHITESPACE_PATTERN,
} from "../parser.ts"
import type { ParseContext } from "@metafor/types/template/parser"
import type { ValueEvent } from "@metafor/types/template/attribute/event"

/**
 * Обрабатывает событийные атрибуты и создает соответствующие объекты.
 */
export const processEventAttributes = (
  eventAttrs: Record<string, string>,
  ctx: ParseContext
): Record<string, any> => {
  const result: Record<string, any> = {}

  for (const [key, value] of Object.entries(eventAttrs)) {
    const eventResult = parseEventExpression(value, ctx)
    const processed = processSingleEventAttribute(value, eventResult)

    if (processed) {
      result[key] = processed
    }
  }

  // Если секция событий пуста, удаляем её
  if (Object.keys(result).length === 0) {
    return {}
  }

  return result
}

/**
 * Парсит событийные выражения и извлекает пути к данным.
 *
 * Эта функция специально предназначена для обработки событий типа:
 * - () => core.onClick()
 * - (e) => core.onInput(e)
 * - () => item.handleClick(item.id)
 *
 * @param eventValue - Значение события для парсинга
 * @param context - Парсер полей с информацией о текущем map контексте
 * @returns Результат парсинга с путями к данным и унифицированным выражением
 */

export const parseEventExpression = (
  eventValue: string,
  ctx: ParseContext = { pathStack: [], level: 0 }
): ValueEvent | null => {
  // Проверяем, является ли это условным выражением (не событием)
  // Ищем тернарный оператор ? ... : (но не стрелочную функцию =>)
  const hasConditionalOperators = CONDITIONAL_OPERATORS_PATTERN.test(eventValue) && !eventValue.includes("=>")
  if (hasConditionalOperators) {
    return null
  }

  // Проверяем, является ли это template literal (не событием)
  const hasTemplateLiteral = eventValue.includes("${")
  if (hasTemplateLiteral) {
    return null
  }

  // Проверяем, является ли это update выражением
  if (eventValue.includes("update(")) {
    // Ищем объект в update({ ... }) - может быть внутри стрелочной функции
    const objectMatch = eventValue.match(UPDATE_OBJECT_PATTERN)
    if (objectMatch) {
      const objectContent = objectMatch[1] || ""

      // Извлекаем ключи из объекта
      const keyMatches = objectContent.match(OBJECT_KEY_PATTERN) || []
      const keys = keyMatches.map((match) => match.replace(/\s*:$/, "").trim())

      if (keys.length > 0) {
        // Ищем переменные в значениях (например, core.name, ctx.count)
        const variableMatches = objectContent.match(VARIABLE_WITH_DOTS_PATTERN) || []
        const uniqueVariables = [...new Set(variableMatches)].filter((variable) => {
          // Исключаем строковые литералы, короткие идентификаторы и булевые литералы
          return (
            variable.length > 1 &&
            !variable.startsWith('"') &&
            !variable.startsWith("'") &&
            !variable.includes('"') &&
            !variable.includes("'") &&
            variable !== "true" &&
            variable !== "false"
          )
        })

        let result: any = {
          upd: keys.length === 1 ? keys[0] || "" : keys,
        }

        // Если есть переменные, добавляем пути к данным
        if (uniqueVariables.length > 0) {
          const paths = uniqueVariables
            .map((variable) => resolveDataPath(variable, ctx))
            .filter((path) => path && path.length > 0) as string[]
          if (paths.length > 0) {
            result.data = paths.length === 1 ? paths[0]! : paths
          }
        }

        // Обрабатываем выражение напрямую
        let expr = eventValue
        if (uniqueVariables.length > 0) {
          uniqueVariables.forEach((variable, index) => {
            expr = expr.replace(
              new RegExp(`\\b${variable.replace(/\./g, "\\.")}\\b`, "g"),
              `${ARGUMENTS_PREFIX}[${index}]`
            )
          })
        }

        result.expr = expr.replace(TEMPLATE_WRAPPER_PATTERN, "").replace(WHITESPACE_PATTERN, " ").trim()

        return result as ValueEvent
      }
    }
  }

  // Извлекаем переменные из события
  // Ищем все переменные в формате identifier.identifier
  const variableMatches = eventValue.match(VARIABLE_WITH_DOTS_PATTERN) || []

  if (variableMatches.length === 0) {
    return null
  }

  // Проверяем, является ли это стрелочной функцией
  const hasArrowFunction = eventValue.includes("=>")

  // Фильтруем уникальные переменные и исключаем строковые литералы
  const uniqueVariables = [...new Set(variableMatches)].filter((variable) => {
    // Исключаем строковые литералы и короткие идентификаторы
    return (
      variable.length > 1 &&
      !variable.startsWith('"') &&
      !variable.startsWith("'") &&
      !variable.includes('"') &&
      !variable.includes("'")
    )
  })

  if (uniqueVariables.length === 0) {
    return null
  }

  // Разрешаем пути к данным с учетом контекста
  const paths = uniqueVariables.map((variable) => resolveDataPath(variable, ctx))

  // Создаем унифицированное выражение
  let expr = eventValue
  uniqueVariables.forEach((variable, index) => {
    // Заменяем переменные на индексы, учитывая границы слов
    expr = expr.replace(new RegExp(`\\b${variable.replace(/\./g, "\\.")}\\b`, "g"), `${ARGUMENTS_PREFIX}[${index}]`)
  })

  // Убираем ${} обертку если она есть, но только если это не template literal
  if (!expr.includes("${")) {
    expr = expr.replace(/^\$\{/, "").replace(/\}$/, "")
  }

  // Применяем форматирование
  expr = expr.replace(WHITESPACE_PATTERN, " ").trim()

  // Если это простая переменная без стрелочной функции, не возвращаем expr
  if (!hasArrowFunction && uniqueVariables.length === 1 && expr === `${ARGUMENTS_PREFIX}[0]`) {
    return { data: paths[0] || "" }
  }

  return { data: paths.length === 1 ? paths[0] || "" : paths, expr }
}

/**
 * Общая функция для обработки событийных атрибутов.
 * Устраняет дублирование кода в processEventAttributes.
 */

export const processSingleEventAttribute = (value: string, eventResult: any): any => {
  if (eventResult) {
    // Для update выражений может быть пустой массив data, но есть upd
    if (eventResult.upd) {
      // Это update выражение
      const eventObj: any = {
        expr: eventResult.expr || "",
        upd: eventResult.upd,
      }
      // Добавляем data только если оно есть
      if (eventResult.data) {
        eventObj.data = eventResult.data
      }
      return eventObj
    } else if (eventResult.data) {
      // Обычное событие с данными
      if (eventResult.expr && typeof eventResult.expr === "string") {
        // Если есть выражение, создаем AttrDynamic (может быть массив или строка)
        return {
          data: eventResult.data,
          expr: eventResult.expr,
        }
      } else {
        // Если нет выражения, создаем AttrVariable (только строка)
        return {
          data: Array.isArray(eventResult.data) ? eventResult.data[0] || "" : eventResult.data,
        }
      }
    }
  }

  // Если не удалось распарсить событие и value не пустая строка, создаем объект с data
  if (value && value.trim() !== "") {
    return {
      data: value,
    }
  }

  // Иначе возвращаем null для игнорирования пустых событий
  return null
}
/**
 * Общая функция для обработки булевых атрибутов с переменными.
 * Устраняет дублирование кода в processBooleanAttributes.
 */

export const processBooleanAttributeWithVariables = (
  booleanValue: string,
  ctx: ParseContext
): { data: string | string[]; expr?: string } | null => {
  const variableMatches = booleanValue.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+)/g) || []

  if (variableMatches.length === 0) {
    return null
  }

  // Обрабатываем все переменные в выражении
  const paths = variableMatches.map((variable) => resolveDataPath(variable, ctx))

  // Создаем выражение, заменяя переменные на индексы
  let expr = booleanValue
  variableMatches.forEach((variable, index) => {
    expr = expr.replace(new RegExp(`\\b${variable.replace(/\./g, "\\.")}\\b`, "g"), `${ARGUMENTS_PREFIX}[${index}]`)
  })

  if (paths.length === 1) {
    // Проверяем, есть ли отрицание или другие операции
    const hasNegation = booleanValue.includes("!(") || booleanValue.includes("!")
    const hasComplexOperations = /[%+\-*/===!===!=<>().]/.test(booleanValue)

    // Проверяем, является ли это просто переменной без операций
    const isSimpleVariable = /^[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*$/.test(booleanValue.trim())

    if ((hasNegation || hasComplexOperations) && !isSimpleVariable) {
      // Для отрицания убираем лишние скобки
      let finalExpr = expr
      if (hasNegation && expr.includes("!(") && expr.includes(")")) {
        finalExpr = expr.replace(/^!\(/, "!").replace(/\)$/, "")
      }

      return {
        data: paths[0] || "",
        expr: finalExpr,
      }
    } else {
      // Простая переменная без операций
      return {
        data: paths[0] || "",
      }
    }
  } else {
    return {
      data: paths,
      expr: expr,
    }
  }
}
