import { renderArrayElement } from "./array"
import { evaluateCondition } from "./condition"
import { applyAttributes, evaluateAttribute } from "./attribute"
import { renderMetaElement } from "./meta"
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
    renderArrayElement(state, schema, context, core, parentElement, update, arrayContext)
    return
  }

  const el = document.createElement(schema.tag as string)

  if (schema.attrs) applyAttributes(el, schema.attrs, state, context, core, arrayContext)

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
