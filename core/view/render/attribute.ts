import { evaluateCondition } from "./condition"
import type { ContextSchema, ExtractValues } from "../../context"
import type { Core } from "../../index.t"
import type { AttributeValue } from "../parser"
import type { ArrayRenderContext, AttributeResult } from "./index.t"
import { evaluateInterpolation } from "./utils"

/**
 * Оценивает значение атрибута
 */

export function evaluateAttribute<C extends ContextSchema, S extends string, I extends Core>(
  state: S,
  context: ExtractValues<C>,
  core: I,
  attribute: AttributeValue,
  arrayContext?: ArrayRenderContext
): AttributeResult {
  // Статическое значение
  if (typeof attribute === "string") {
    return attribute
  }

  // Условный атрибут (проверяем первым)
  if ("type" in attribute && attribute.type === "conditional" && "trueValue" in attribute) {
    const conditionalAttr = attribute as { src: string; key: string; trueValue: string; falseValue?: string }

    // Для условных атрибутов в массивах используем arrayContext
    if (conditionalAttr.src === "item" && arrayContext) {
      // Для item.* используем прямое сравнение
      if (conditionalAttr.key) {
        const value = arrayContext.item[conditionalAttr.key]
        const isTrue = Boolean(value)
        return isTrue ? conditionalAttr.trueValue : conditionalAttr.falseValue || ""
      }
      return conditionalAttr.falseValue || ""
    } else {
      const condition = {
        src: conditionalAttr.src,
        key: conditionalAttr.key || "",
        eq: true,
      }
      const isTrue = evaluateCondition(state, condition, context, core, arrayContext)
      return isTrue ? conditionalAttr.trueValue : conditionalAttr.falseValue || ""
    }
  }

  // Интерполяция
  if ("src" in attribute && "key" in attribute) {
    let source: any

    switch (attribute.src) {
      case "context":
        source = context
        break
      case "core":
        source = core
        break
      case "item":
        if (!arrayContext) return ""
        source = arrayContext.item
        break
      default:
        return ""
    }
    if (attribute.key) {
      if ("result" in attribute)
        return evaluateInterpolation(attribute.result, state, context, core, arrayContext)
      const path = Array.isArray(attribute.key) ? attribute.key : [attribute.key]
      let current: any = source
      for (const p of path) {
        if (current == null) break
        current = current[p as any]
      }
      return current
    } else {
      return source
    }
  }

  // Смешанный контент
  if ("result" in attribute) {
    return attribute.result
  }

  return ""
}
