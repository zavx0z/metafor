import { evaluateCondition } from "./condition"
import type { ContextSchema, ExtractValues } from "../../context"
import type { Core } from "../../index.t"
import type { AttributeValue } from "../parser"
import type { ArrayRenderContext, AttributeResult } from "./index.t"
// import { evaluateInterpolation } from "./utils"

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

    // Обработка булевых атрибутов
    if (BOOLEAN_ATTRIBUTES.has(name)) {
      if (evaluatedValue === true) {
        element.toggleAttribute(name, true)
        continue
      }
      if (typeof evaluatedValue === "string") {
        if (evaluatedValue.length > 0) {
          element.toggleAttribute(name, true)
          continue
        }
        // пустая строка для булевого атрибута — не устанавливаем
        continue
      }
      if (evaluatedValue === false || evaluatedValue === undefined) {
        continue
      }
    }

    if (evaluatedValue === false || evaluatedValue === undefined) {
      // Пропускаем false/undefined атрибуты
      continue
    } else {
      // Обычный атрибут
      if (typeof evaluatedValue === "string" && evaluatedValue.length === 0) {
        // пустая строка для небулевых атрибутов — пропускаем (не устанавливаем name="")
        continue
      }
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
    const conditionalAttr = attribute as {
      src: string | string[]
      key: string | string[]
      trueValue: string
      falseValue?: string
      result?: "not"
    }

    const resolveSourceAndValue = (): any => {
      // Путь как массив: используем механику из блока ниже
      if (Array.isArray(conditionalAttr.src)) {
        const srcPath = conditionalAttr.src as string[]
        // Переиспользуем логику traversal из обычного src: string[]
        const [root, ...rest] = srcPath
        let rootObj: any =
          root === "context" ? context : root === "core" ? core : root === "state" ? (state as any) : undefined
        let current: any = rootObj
        const getContextChain = (ctx?: ArrayRenderContext): ArrayRenderContext[] => {
          const chain: ArrayRenderContext[] = []
          let cur = ctx
          while (cur) {
            chain.push(cur)
            cur = cur.parent
          }
          return chain
        }
        const findContextForArray = (arr: any[]): ArrayRenderContext | undefined => {
          if (!arrayContext) return undefined
          const chain = getContextChain(arrayContext)
          return chain.find((c) => c.array === arr)
        }
        for (const seg of rest) {
          if (current == null) break
          current = current[seg as any]
          if (Array.isArray(current)) {
            const ctx = findContextForArray(current)
            if (ctx) current = ctx.item
          }
        }
        // key может быть тоже путём
        if (conditionalAttr.key) {
          const path = Array.isArray(conditionalAttr.key) ? conditionalAttr.key : [conditionalAttr.key]
          for (const seg of path) {
            if (current == null) break
            current = current[seg as any]
          }
        }
        return current
      }

      // item
      if (conditionalAttr.src === "item") {
        if (!arrayContext) return undefined
        let current: any = arrayContext.item
        if (conditionalAttr.key) {
          const path = Array.isArray(conditionalAttr.key) ? conditionalAttr.key : [conditionalAttr.key]
          for (const seg of path) {
            if (current == null) break
            current = current[seg as any]
          }
        }
        return current
      }

      // context/core/state
      let source: any
      switch (conditionalAttr.src) {
        case "context":
          source = context
          break
        case "core":
          source = core
          break
        case "state":
          source = state
          break
        default:
          return undefined
      }
      if (conditionalAttr.key) {
        const path = Array.isArray(conditionalAttr.key) ? conditionalAttr.key : [conditionalAttr.key]
        let current: any = source
        for (const seg of path) {
          if (current == null) break
          current = current[seg as any]
        }
        return current
      }
      return source
    }

    const val = resolveSourceAndValue()
    const base = val === true
    const isTrue = conditionalAttr.result === "not" ? !base : base
    return isTrue ? conditionalAttr.trueValue : (conditionalAttr.falseValue ?? "")
  }

  // Простой источник (src/key) или глобальный путь (src: string[])
  if ("src" in attribute && ("key" in attribute || Array.isArray((attribute as any).src))) {
    // src может быть строкой (context|core|item) или путём string[] к массиву
    const srcVal: any = (attribute as any).src

    // Случай: src - путь к массиву (например, ["core", "groups"]) в контексте рендера массива
    if (Array.isArray(srcVal)) {
      if (!arrayContext) return ""

      const getContextChain = (ctx?: ArrayRenderContext): ArrayRenderContext[] => {
        const chain: ArrayRenderContext[] = []
        let current = ctx
        while (current) {
          chain.push(current)
          current = current.parent
        }
        return chain
      }

      const findContextForArray = (arr: any[]): ArrayRenderContext | undefined => {
        const chain = getContextChain(arrayContext)
        return chain.find((c) => c.array === arr)
      }

      // 1) Разворачиваем путь от корня (context/core/state) до нужного узла
      const [root, ...rest] = srcVal as string[]
      let rootObj: any =
        root === "context" ? context : root === "core" ? core : root === "state" ? (state as any) : undefined
      let current: any = rootObj
      for (const seg of rest) {
        if (current == null) break
        current = current[seg as any]
        if (Array.isArray(current)) {
          const ctx = findContextForArray(current)
          if (ctx) current = ctx.item
        }
      }
      // 2) Если после полного пути остался массив (например, items), привязываем к текущему контексту
      if (Array.isArray(current)) {
        const ctx = findContextForArray(current)
        if (ctx) current = ctx.item
      }
      // 3) Применяем key (если задан)
      if ((attribute as any).key) {
        const path = Array.isArray((attribute as any).key) ? (attribute as any).key : [(attribute as any).key]
        for (const seg of path) {
          if (current == null) break
          current = current[seg as any]
        }
      }
      return current
    }

    // Обычный случай: src строкой
    let source: any
    switch (srcVal) {
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
    if ((attribute as any).key) {
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

  // Шаблонный формат: { template, items }
  if ((attribute as any) && typeof attribute === "object" && "template" in (attribute as any)) {
    const { template, items } = attribute as any as {
      template: string
      items: Array<
        | { src: "state" }
        | { src: "context" | "core"; key: string | string[] }
        | { src: string[]; key?: string | string[] }
        | { src: "item"; key?: string | string[] }
      >
    }
    const values: string[] = items.map((it) => {
      // state
      if ((it as any).src === "state") return String(state ?? "")
      // глобальный путь
      if (Array.isArray((it as any).src)) {
        if (!arrayContext) return ""
        const getContextChain = (ctx?: ArrayRenderContext): ArrayRenderContext[] => {
          const chain: ArrayRenderContext[] = []
          let current = ctx
          while (current) {
            chain.push(current)
            current = current.parent
          }
          return chain
        }
        const findContextForArray = (arr: any[]): ArrayRenderContext | undefined => {
          const chain = getContextChain(arrayContext)
          return chain.find((c) => c.array === arr)
        }
        const [root, ...rest] = (it as any).src as string[]
        let rootObj: any =
          root === "context" ? context : root === "core" ? core : root === "state" ? (state as any) : undefined
        let current: any = rootObj
        for (const seg of rest) {
          if (current == null) break
          current = current[seg as any]
          if (Array.isArray(current)) {
            const ctx = findContextForArray(current)
            if (ctx) current = ctx.item
          }
        }
        const baseObject = current
        if ((it as any).key) {
          const path = Array.isArray((it as any).key) ? (it as any).key : [(it as any).key]
          for (const seg of path) {
            if (current == null) break
            current = current[seg as any]
          }
        }
        if (Array.isArray(current)) {
          current = baseObject
        }
        return String(current ?? "")
      }
      // context/core
      if ((it as any).src === "context" || (it as any).src === "core") {
        const source: any = (it as any).src === "context" ? context : core
        if ((it as any).key) {
          const path = Array.isArray((it as any).key) ? (it as any).key : [(it as any).key]
          let current: any = source
          for (const seg of path) {
            if (current == null) break
            current = current[seg as any]
          }
          return String(current ?? "")
        }
        return ""
      }
      // item
      if ((it as any).src === "item") {
        if (!arrayContext) return ""
        let current: any = arrayContext.item
        if ((it as any).key) {
          const path = Array.isArray((it as any).key) ? (it as any).key : [(it as any).key]
          for (const seg of path) {
            if (current == null) break
            current = current[seg as any]
          }
        }
        return String(current ?? "")
      }
      return ""
    })

    return template.replace(/\$\{(\d+)\}/g, (_m, idx) => values[Number(idx)] ?? "")
  }

  return ""
}
