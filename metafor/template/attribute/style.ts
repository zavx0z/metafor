import { resolveDataPath } from "../parser"
import type { ParseContext } from "../parser.t"
import type { ValueVariable } from "../parser.t"
import type { ValueStyle } from "./style.t"

/**
 * Обрабатывает строку стилей с плоским по-ключевому парсингом.
 *
 * Разбирает строку стилей на ключ-значение пары и разрешает пути к данным
 * для каждого значения отдельно. Подходит для style атрибутов, где нужен
 * адресный контроль по ключам.
 *
 * @param str - Строка стилей в формате "{ key: value, key2: value2 }"
 * @param ctx - Контекст парсера
 * @returns Объект с ключами стилей и разрешенными путями к данным
 */
export const processStyleAttributes = (
  str: string,
  ctx: ParseContext = { pathStack: [], level: 0 }
): Record<string, ValueStyle> | null => {
  // Убираем фигурные скобки и пробелы
  const cleanValue = str.replace(/^\{?\s*|\s*\}?$/g, "")

  if (!cleanValue) {
    return null
  }

  // Разбираем объект стилей
  const styleObj: Record<string, ValueStyle> = {}
  const pairs = cleanValue.split(",")

  for (const pair of pairs) {
    const [key, value] = pair.split(":").map((s) => s.trim())
    if (key && value) {
      // Проверяем, содержит ли значение переменные (сложные выражения)
      // Исключаем строковые литералы в кавычках
      const cleanValue = value.replace(/"[^"]*"/g, "").replace(/'[^']*'/g, "")
      const hasVariables = /[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*/.test(cleanValue)

      if (hasVariables) {
        // Это выражение с переменными - разрешаем пути к данным
        const variableMatches = value.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)/g) || []
        const uniqueVariables = [...new Set(variableMatches)]

        if (uniqueVariables.length > 0) {
          const paths = uniqueVariables.map((variable: string) => resolveDataPath(variable, ctx) || variable)
          styleObj[key] = { data: paths.length === 1 ? paths[0] || "" : paths } as ValueVariable
        } else {
          styleObj[key] = value
        }
      } else {
        // Это статическое значение - убираем лишние кавычки
        styleObj[key] = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "")
      }
    }
  }

  return Object.keys(styleObj).length > 0 ? styleObj : null
}
