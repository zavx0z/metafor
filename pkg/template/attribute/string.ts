import { processTemplateLiteralAttribute } from "../parser.ts"
import type { ParseContext } from "@metafor/types/template/parser"

/**
 * Обрабатывает строковые атрибуты и создает соответствующие объекты.
 */
export const processStringAttributes = (
  stringAttrs: Record<string, { type: string; value: string }>,
  ctx: ParseContext
): Record<string, any> => {
  const result: Record<string, any> = {}

  for (const [key, attr] of Object.entries(stringAttrs)) {
    if (attr.type === "static") {
      result[key] = attr.value
    } else if (attr.type === "dynamic" || attr.type === "mixed") {
      const processed = processTemplateLiteralAttribute(attr.value, ctx)
      result[key] = processed || attr.value
    }
  }

  return result
}
