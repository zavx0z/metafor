import type { ContextSchema, ExtractValues } from "../../context"
import type { Core } from "../../index.t"
import type { TextSchema } from "../parser"
import type { ArrayRenderContext } from "./index.t"
import { evaluateInterpolation } from "./utils"

/**
 * Рендерит текстовый узел
 */
export function renderText<C extends ContextSchema, S extends string, I extends Core>(
  state: S,
  text: TextSchema,
  context: ExtractValues<C>,
  core: I,
  parentElement: HTMLElement | DocumentFragment,
  arrayContext?: ArrayRenderContext
): void {
  let value: string

  if (typeof text.value === "string") {
    value = text.value
  } else {
    // Интерполяция
    let source: any
    switch (text.value.src) {
      case "context":
        source = context
        break
      case "core":
        source = core
        break
      case "item":
        if (!arrayContext) {
          value = ""
          break
        }
        source = arrayContext.item
        break
      default:
        value = ""
        break
    }

    if (text.value.key && "result" in text.value)
      value = evaluateInterpolation(text.value.result, state, context, core, arrayContext)
    else if (text.value.key) value = String(source?.[text.value.key] || "")
    else {
      value = String(source || "")
    }
  }

  if (value) {
    parentElement.appendChild(document.createTextNode(value))
  }
}
