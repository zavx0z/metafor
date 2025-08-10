import type { ContextSchema, ExtractValues, Update } from "../../context"
import type { Core } from "../../index.t"
import { evaluateCondition } from "./condition"
import type { ElementSchema } from "../parser"
import { evaluateAttribute } from "./attribute"
import { renderElement } from "./element"
import type { ArrayRenderContext } from "./index.t"
import { renderText } from "./text"

/**
 * Рендерит элемент массива
 */

export function renderArrayElement<C extends ContextSchema, S extends string, I extends Core>(
  state: S,
  element: ElementSchema,
  context: ExtractValues<C>,
  core: I,
  parentElement: HTMLElement | DocumentFragment,
  update: Update<any>
): void {
  if (!element.item) return

  let source: any
  switch (element.item.src) {
    case "context":
      source = context[element.item.key]
      break
    case "core":
      source = core[element.item.key]
      break
    default:
      return
  }

  if (!Array.isArray(source)) return

  source.forEach((item, index) => {
    const arrayContext: ArrayRenderContext = {
      item,
      index,
      array: source,
    }

    // Проверяем условие
    if (element.cond) {
      const shouldRender = evaluateCondition(state, element.cond, context, core, arrayContext)
      if (!shouldRender) return
    }

    // Создаем элемент
    const el = document.createElement(element.tag)

    // Устанавливаем атрибуты
    if (element.attrs) {
      for (const [name, value] of Object.entries(element.attrs)) {
        const evaluatedValue = evaluateAttribute(state, context, core, value, arrayContext)

        if (evaluatedValue === true) {
          // Булев атрибут
          el.setAttribute(name, "")
        } else if (evaluatedValue === false || evaluatedValue === undefined || evaluatedValue === "") {
          // Пропускаем false/undefined/пустые атрибуты
          continue
        } else {
          // Обычный атрибут
          el.setAttribute(name, String(evaluatedValue))
        }
      }
    }

    // Рендерим дочерние элементы
    if (element.child) {
      element.child.forEach((child) => {
        if (child.type === "el") {
          renderElement(state, child, context, core, el, update, arrayContext)
        } else if (child.type === "text") {
          renderText(state, child, context, core, el, arrayContext)
        }
      })
    }

    parentElement.appendChild(el)
  })
}
