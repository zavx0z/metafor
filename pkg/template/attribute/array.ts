import { processTemplateLiteralAttribute, resolveDataPath, ARGUMENTS_PREFIX } from "../parser.ts"
import type { ParseContext } from "../parser.t.ts"
import type { RawAttrArray, ValueArray } from "./array.t.ts"

/**
 * Обрабатывает массивные атрибуты и создает соответствующие объекты.
 */
export const processArrayAttributes = (
  arrayAttrs: RawAttrArray,
  ctx: ParseContext
): Record<string, ValueArray[]> => {
  const result: Record<string, ValueArray[]> = {}
  for (const [key, values] of Object.entries(arrayAttrs)) {
    result[key] = values.map((item) => {
      if (item.type === "static") return item.value
      else if (item.type === "dynamic" || item.type === "mixed") {
        // Для динамических и смешанных атрибутов обрабатываем значение
        const processed = processTemplateLiteralAttribute(item.value, ctx)
        if (processed) return processed
        else {
          // Если parseTemplateLiteral вернул null, но это dynamic тип,
          // значит это уже нормализованное значение без ${}
          // Нужно обработать его как динамическое выражение
          const variableMatches = item.value.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+)/g) || []
          if (variableMatches.length > 0) {
            const paths = variableMatches.map((variable) => resolveDataPath(variable, ctx))
            let expr = item.value
            variableMatches.forEach((variable, index) => {
              expr = expr.replace(
                new RegExp(`\\b${variable.replace(/\./g, "\\.")}\\b`, "g"),
                `${ARGUMENTS_PREFIX}[${index}]`
              )
            })
            return { data: paths.length === 1 ? paths[0] || "" : paths, expr: `\${${expr}}` }
          } else {
            return item.value
          }
        }
      } else return item.value // Для неизвестных типов возвращаем как есть
    })
  }

  return result
}
