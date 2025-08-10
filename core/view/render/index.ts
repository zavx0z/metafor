import type { ContextSchema } from "../../context/types.t.ts"
import type { Core } from "../../index.t.ts"
import { renderElement } from "./element.ts"
import type { RenderParams } from "./index.t.ts"
import { renderText } from "./text.ts"

/**
 * Основная функция рендеринга
 */
export function render<C extends ContextSchema, S extends string, I extends Core>({
  state,
  context,
  core,
  element,
  update,
  schema,
}: RenderParams<C, S, I>): void {
  if (!schema) return

  // Очищаем элемент
  if ("innerHTML" in element) {
    element.innerHTML = ""
  } else {
    // Для DocumentFragment удаляем все дочерние элементы
    while (element.firstChild) {
      element.removeChild(element.firstChild)
    }
  }

  // Рендерим каждый элемент схемы
  for (const item of schema) {
    if (item.type === "el") {
      renderElement(state, item, context, core, element, update)
    } else if (item.type === "text") {
      renderText(state, item, context, core, element)
    }
  }
}
