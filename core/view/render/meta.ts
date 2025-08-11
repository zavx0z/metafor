import type { ContextSchema, ExtractValues, Update } from "../../context"
import type { ActorInternal, Core } from "../../index.t"
import type { ElementSchema } from "../parser"
import type { ArrayRenderContext } from "./index.t"

/**
 * Вычисляет значения context и core объектов для meta-элементов
 */
export function evaluateMetaObject<C extends ContextSchema, I extends Core>(
  obj: Record<string, string | number | boolean | null | { src: "context" | "core"; key: string }>,
  context: ExtractValues<C>,
  core: I
): Record<string, any> {
  const result: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null && "src" in value) {
      // Это ссылка на context или core
      const { src, key: sourceKey } = value as { src: "context" | "core"; key: string }
      const source = src === "context" ? context : core

      // Получаем значение по пути (например, "user.family")
      const keys = sourceKey.split(".")
      let currentValue: any = source

      for (const k of keys) {
        if (currentValue && typeof currentValue === "object" && k in currentValue) {
          currentValue = currentValue[k]
        } else {
          currentValue = undefined
          break
        }
      }

      result[key] = currentValue
    } else {
      // Примитивное значение
      result[key] = value
    }
  }

  return result
}

/**
 * Создает meta-элемент с правильным именем тега
 */
export function createMetaElement<C extends ContextSchema, I extends Core>(
  schema: ElementSchema,
  context: ExtractValues<C>,
  core: I
): HTMLElement {
  if (schema.type === "meta") {
    // Если tag - это объект с key, то извлекаем значение из core
    if (typeof schema.tag === "object" && schema.tag && "key" in schema.tag) {
      let value: string
      if (Array.isArray(schema.tag.key)) {
        let src = core as any
        for (const key of schema.tag.key) {
          src = src[key]
        }
        value = src as string
      } else {
        value = core[schema.tag.key] as string
      }
      const tagName = `meta-${value}`
      return document.createElement(tagName)
    }
    // Если tag - это строка, просто создаем элемент с этим именем
    else if (typeof schema.tag === "string") {
      return document.createElement(schema.tag)
    }
  }

  throw new Error("Invalid meta element schema")
}

/**
 * Применяет context и core к meta-элементу
 */
export function applyMetaData<C extends ContextSchema, I extends Core>(
  element: HTMLElement,
  schema: ElementSchema,
  context: ExtractValues<C>,
  core: I
): void {
  if (schema.type === "meta") {
    if (schema.context) {
      const evaluatedContext = evaluateMetaObject(schema.context, context, core)
      ;(element as any).context = evaluatedContext
    }

    if (schema.core) {
      const evaluatedCore = evaluateMetaObject(schema.core, context, core)
      ;(element as any).core = evaluatedCore
    }
  }
}
