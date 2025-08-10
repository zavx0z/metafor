import { renderArrayElement } from "./array"
import { evaluateCondition } from "./condition"
import { evaluateAttribute } from "./attribute"
import type { ContextSchema, ExtractValues, Update } from "../../context"
import type { Core } from "../../index.t"
import type { ElementSchema } from "../parser"
import type { ArrayRenderContext } from "./index.t"
import { renderText } from "./text"

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

  // Создаем элемент
  const el = document.createElement(schema.tag)

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

  // Рендерим дочерние элементы
  if (schema.child) {
    for (const child of schema.child) {
      if (child.type === "el") {
        renderElement(state, child, context, core, el, update, arrayContext)
      } else if (child.type === "text") {
        renderText(state, child, context, core, el, arrayContext)
      }
    }
  }

  parentElement.appendChild(el)
}
