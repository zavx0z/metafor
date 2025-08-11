import type { ContextSchema, ExtractValues, Update } from "../../context"
import type { ActorInternal, Core } from "../../index.t"
import type { ElementSchema } from "../parser"
import { renderArrayElement } from "./array"
import { evaluateCondition } from "./condition"
import { applyAttributes } from "./attribute"
import { renderElement } from "./element"
import type { ArrayRenderContext } from "./index.t"
import { renderText } from "./text"
import type { HtmlParseTag } from "../parser/index.t"

/**
 * Создает meta-элемент с правильным именем тега
 */
export function renderMetaElement<C extends ContextSchema, S extends string, I extends Core>(
  state: S,
  schema: ElementSchema,
  context: ExtractValues<C>,
  core: I,
  parentElement: HTMLElement | DocumentFragment,
  update: Update<any>,
  arrayContext?: ArrayRenderContext
): void {
  // Проверяем условие
  if (schema.cond) {
    const shouldRender = evaluateCondition(state, schema.cond, context, core, arrayContext)
    if (!shouldRender) return
  }

  // Если это элемент массива, рендерим его как массив
  if (schema.item) {
    renderArrayElement(state, schema, context, core, parentElement, update)
    return
  }

  const el = document.createElement(createTagName(schema.tag, core)) as ActorInternal

  if (schema.attrs) applyAttributes(el, schema.attrs, state, context, core, arrayContext)
  if (schema.context) el.update(evaluateMetaObject(schema.context, context, core))
  if (schema.core) el.__updCore(evaluateMetaObject(schema.core, context, core))

  // Рендерим дочерние элементы
  if (schema.child) {
    for (const child of schema.child) {
      switch (child.type) {
        case "text":
          renderText(state, child, context, core, el, arrayContext)
          break
        case "wc":
        case "el":
          renderElement(state, child, context, core, el, update, arrayContext)
          break
        case "meta":
          renderMetaElement(state, child, context, core, el, update, arrayContext)
          break
      }
    }
  }
  parentElement.appendChild(el)
}

/**
 * Создает имя тега для meta-элемента
 */
function createTagName(tag: HtmlParseTag, core: Core): string {
  let tagName: string
  // Если tag - это объект с key, то извлекаем значение из core
  if (typeof tag === "object" && tag && "key" in tag) {
    let value: string
    if (Array.isArray(tag.key)) {
      let src = core as any
      for (const key of tag.key) {
        src = src[key]
      }
      value = src as string
    } else {
      value = core[tag.key] as string
    }
    tagName = `meta-${value}`
  } else tagName = tag
  return tagName
}
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
