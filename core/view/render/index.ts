import type { ContextSchema } from "../../context/types.t.ts"
import type { Core } from "../../index.t.ts"
import { renderElement } from "./element.ts"
import type { RenderParams } from "./index.t.ts"
import { renderText } from "./text.ts"
import { resolveConditionalSequences } from "./condition.ts"
import { renderMetaElement } from "./meta.ts"

/**
 * Основная функция рендеринга
 */
export function render<C extends ContextSchema, S extends string, I extends Core>({
  state,
  context,
  core,
  container,
  update,
  schema,
}: RenderParams<C, S, I>): void {
  if (!schema) return

  // Очищаем элемент
  if ("innerHTML" in container) {
    ;(container as HTMLElement).innerHTML = ""
  } else {
    while (container.firstChild) {
      container.removeChild(container.firstChild)
    }
  }

  // Предобрабатываем последовательности условных элементов на корне
  const prepared = resolveConditionalSequences(state, schema, context, core)

  // Рендерим каждый элемент схемы
  for (const item of prepared) {
    switch (item.type) {
      case "text":
        renderText(state, item, context, core, container)
        break
      case "wc":
      case "el":
        renderElement(state, item, context, core, container, update)
        break
      case "meta":
        renderMetaElement(state, item, context, core, container, update)
        break
    }
  }
}
