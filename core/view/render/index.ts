import type { ContextSchema } from "../../context/types.t.ts"
import type { Core } from "../../index.t.ts"
import { renderElement } from "./element.ts"
import type { RenderParams } from "./index.t.ts"
import { renderText } from "./text.ts"
import { resolveConditionalSequences } from "./condition.ts"

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
    ;(element as HTMLElement).innerHTML = ""
  } else {
    while (element.firstChild) {
      element.removeChild(element.firstChild)
    }
  }

  // Предобрабатываем последовательности условных элементов на корне
  const prepared = resolveConditionalSequences(state, schema, context, core)

  // Рендерим каждый элемент схемы
  for (const item of prepared) {
    if (item.type === "el") {
      renderElement(state, item, context, core, element, update)
    } else if (item.type === "text") {
      renderText(state, item, context, core, element)
    }
  }
}
