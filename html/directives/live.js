import {setCommittedValue} from "../directive-helpers.js"
import {directive, Directive, PartType} from "../directive.js"
import {noChange, nothing} from "../html.js"
import { isSingleExpression } from "./utils.js"

class LiveDirective extends Directive {
  /** @param {import("../types/directives.js").PartInfo} partInfo - Информация о части */
  constructor(partInfo) {
    super(partInfo)
    if (
      !(
        partInfo.type === PartType.PROPERTY ||
        partInfo.type === PartType.ATTRIBUTE ||
        partInfo.type === PartType.BOOLEAN_ATTRIBUTE
      )
    ) {
      throw new Error("Директива `live` не разрешена для привязок к дочерним элементам или событиям")
    }
    if (!isSingleExpression(partInfo)) {
      throw new Error("Привязки `live` могут содержать только одно выражение")
    }
  }

  /** @param {unknown} value - Значение */
  render(value) {
    return value
  }

  /**
   * @param {import("../html.js").AttributePart} part - Часть
   * @param {import("../types/directives.js").DirectiveParameters<this>} value - Значение
   * */
  update(part, [value]) {
    if (value === noChange || value === nothing) {
      return value
    }
    const element = part.element
    const name = part.name

    if (part.type === PartType.PROPERTY) {
      // @ts-expect-error
      if (value === element[name]) {
        return noChange
      }
    } else if (part.type === PartType.BOOLEAN_ATTRIBUTE) {
      if (!!value === element.hasAttribute(name)) {
        return noChange
      }
    } else if (part.type === PartType.ATTRIBUTE) {
      if (element.getAttribute(name) === String(value)) {
        return noChange
      }
    }
    // Сбрасывает значение части, вызывая сбой проверки на изменение, чтобы
    // значение всегда устанавливалось.
    setCommittedValue(part)
    return value
  }
}

/**
 * Проверяет значения привязок на соответствие текущим значениям DOM, а не
 * ранее связанным значениям, при определении необходимости обновления значения.
 *
 * Это полезно для случаев, когда значение DOM может изменяться извне @pkg/html,
 * например, при привязке к свойству `value` элемента `<input>`, тексту
 * редактируемого элемента или к пользовательскому элементу, который изменяет
 * свои собственные свойства или атрибуты.
 *
 * В таких случаях, если значение DOM изменяется, но значение, установленное
 * через привязки @pkg/html, не изменяется, @pkg/html не узнает о необходимости
 * обновления значения DOM и оставит его без изменений. Если это не то, что вам
 * нужно—если вы хотите перезаписать значение DOM связанным значением независимо
 * от обстоятельств—используйте директиву `live()`:
 *
 * ```js
 * html`<input .value=${live(x)}>`
 * ```
 *
 * `live()` выполняет строгую проверку на равенство с текущим значением DOM, и
 * если новое значение равно текущему значению DOM, ничего не делает. Это
 * означает, что `live()` не следует использовать, когда привязка может вызвать
 * преобразование типа. Если вы используете `live()` с привязкой атрибута,
 * убедитесь, что передаются только строки, иначе привязка будет обновляться
 * при каждом рендере.
 */
export const live = directive(LiveDirective)
