import { evaluateCondition } from "./condition"
import type { ContextSchema, ExtractValues } from "../../context"
import type { Core } from "../../index.t"
import type { AttributeValue } from "../parser"
import type { ArrayRenderContext, AttributeResult } from "./index.t"
import { evaluateInterpolation } from "./utils"

/**
 * Устанавливает атрибуты на элемент
 */
export function applyAttributes<C extends ContextSchema, S extends string, I extends Core>(
  element: HTMLElement,
  attrs: Record<string, AttributeValue>,
  state: S,
  context: ExtractValues<C>,
  core: I,
  arrayContext?: ArrayRenderContext
): void {
  const decodeHtmlEntities = (input: string): string => {
    return input
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&#60;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#62;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&#38;/g, "&")
  }
  const BOOLEAN_ATTRIBUTES = new Set([
    "disabled",
    "readonly",
    "required",
    "checked",
    "selected",
    "multiple",
    "autofocus",
    "autoplay",
    "controls",
    "default",
    "defer",
    "formnovalidate",
    "hidden",
    "loop",
    "muted",
    "open",
    "playsinline",
    "reversed",
    "ismap",
    "allowfullscreen",
    "inert",
    "nomodule",
    "async",
  ])
  for (const [name, value] of Object.entries(attrs)) {
    // Не устанавливаем on*-атрибуты напрямую (Happy DOM интерпретирует их как код)
    if (name.startsWith("on")) {
      continue
    }

    // Статический булев атрибут: в схеме хранится как пустая строка
    if (typeof value === "string" && value === "" && BOOLEAN_ATTRIBUTES.has(name)) {
      element.toggleAttribute(name, true)
      continue
    }
    const evaluatedValue = evaluateAttribute(state, context, core, value, arrayContext)

    if (evaluatedValue === true) {
      // Булев атрибут
      element.toggleAttribute(name, true)
    } else if (evaluatedValue === false || evaluatedValue === undefined) {
      // Пропускаем false/undefined атрибуты
      continue
    } else {
      // Обычный атрибут
      const decoded = typeof evaluatedValue === "string" ? decodeHtmlEntities(evaluatedValue) : evaluatedValue
      element.setAttribute(name, String(decoded))
    }
  }
}

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
      if ("result" in attribute) return evaluateInterpolation(attribute.result, state, context, core, arrayContext)
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
