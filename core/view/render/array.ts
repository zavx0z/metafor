import type { ContextSchema, ExtractValues, Update } from "../../context"
import type { Core } from "../../index.t"
import { evaluateCondition } from "./condition"
import type { ElementSchema } from "../parser"
import { renderElement } from "./element"
import type { ArrayRenderContext } from "./index.t"
import { renderMetaElement } from "./meta"

/**
 * Рендерит элемент массива
 */

export function renderArrayElement<C extends ContextSchema, S extends string, I extends Core>(
  state: S,
  element: ElementSchema,
  context: ExtractValues<C>,
  core: I,
  parentElement: HTMLElement | DocumentFragment,
  update: Update<any>,
  parentArrayContext?: ArrayRenderContext
): void {
  if (!element.item) return

  let source: any
  const itemSrc: any = element.item.src as any
  if (Array.isArray(itemSrc)) {
    // Вложенные массивы: берем массив у текущего элемента родительского массива
    if (!parentArrayContext) return
    source = parentArrayContext.item[(element.item as any).key]
  } else {
    switch (itemSrc) {
      case "context":
        source = (context as any)[(element.item as any).key]
        break
      case "core":
        source = (core as any)[(element.item as any).key]
        break
      default:
        return
    }
  }

  if (!Array.isArray(source)) return

  source.forEach((item, index) => {
    const arrayContext: ArrayRenderContext = {
      item,
      index,
      array: source,
      parent: parentArrayContext,
    }

    // Проверяем условие
    if (element.cond) {
      const shouldRender = evaluateCondition(state, element.cond, context, core, arrayContext)
      if (!shouldRender) return
    }
    // Создаем копию элемента без свойства item для избежания рекурсии
    const elementWithoutItem = { ...element }
    delete elementWithoutItem.item

    switch (element.type) {
      case "wc":
      case "el":
        renderElement(state, elementWithoutItem, context, core, parentElement, update, arrayContext)
        break
      case "meta":
        renderMetaElement(state, elementWithoutItem, context, core, parentElement, update, arrayContext)
        break
      default:
        throw new Error(`Unknown element type: ${element.type}`)
    }
  })
}
