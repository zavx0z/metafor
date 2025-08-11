import { renderArrayElement } from "./array"
import { evaluateCondition } from "./condition"
import { evaluateAttribute } from "./attribute"
import type { ContextSchema, ExtractValues, Update } from "../../context"
import type { Core } from "../../index.t"
import type { ElementSchema } from "../parser"
import type { ArrayRenderContext } from "./index.t"
import { renderText } from "./text"

/**
 * Вычисляет значения context и core объектов для meta-элементов
 */
function evaluateMetaObject<C extends ContextSchema, I extends Core>(
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
 * Рендерит HTML элемент
 */
export function renderElement<C extends ContextSchema, S extends string, I extends Core>(
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
  let el: HTMLElement
  // meta-элемент
  if (typeof schema.tag === "object" && schema.type === "meta") {
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
    el = document.createElement(tagName)
    // стандартный элемент или web-component
  } else if (typeof schema.tag === "string") {
    el = document.createElement(schema.tag)
  } else {
    throw new Error("Invalid tag type")
  }

  // Устанавливаем атрибуты
  if (schema.attrs) {
    for (const [name, value] of Object.entries(schema.attrs)) {
      // Не устанавливаем on*-атрибуты напрямую (Happy DOM интерпретирует их как код)
      if (name.startsWith("on")) {
        continue
      }
      const evaluatedValue = evaluateAttribute(state, context, core, value, arrayContext)

      if (evaluatedValue === true) {
        // Булев атрибут
        el.setAttribute(name, "")
      } else if (evaluatedValue === false || evaluatedValue === undefined) {
        // Пропускаем false/undefined атрибуты
        continue
      } else {
        // Обычный атрибут
        el.setAttribute(name, String(evaluatedValue))
      }
    }
  }

  // Обрабатываем context и core для meta-элементов
  if (schema.type === "meta") {
    if (schema.context) {
      const evaluatedContext = evaluateMetaObject(schema.context, context, core)
      ;(el as any).context = evaluatedContext
    }

    if (schema.core) {
      const evaluatedCore = evaluateMetaObject(schema.core, context, core)
      ;(el as any).core = evaluatedCore
    }
  }

  // Рендерим дочерние элементы
  if (schema.child) {
    for (const child of schema.child) {
      if (child.type === "text") {
        renderText(state, child, context, core, el, arrayContext)
      } else {
        renderElement(state, child, context, core, el, update, arrayContext)
      }
    }
  }

  parentElement.appendChild(el)
}
