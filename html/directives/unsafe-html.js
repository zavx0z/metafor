/**@typedef {import("../types/html.js").TemplateResult} TemplateResult*/
/**@typedef {import("../types/directives.js").PartInfo} PartInfo*/
import {nothing, noChange} from "../html.js"
import {directive, Directive, PartType} from "../directive.js"

const HTML_RESULT = 1

export class UnsafeHTMLDirective extends Directive {
  static directiveName = "unsafeHTML"
  static resultType = HTML_RESULT
  /**
   * @type {unknown}
   * @private
   */
  _value = nothing
  /**
   * @type {TemplateResult|undefined}
   * @private
   */
  _templateResult
  /** @param {PartInfo} partInfo */
  constructor(partInfo) {
    super(partInfo)
    if (partInfo.type !== PartType.CHILD) {
      throw new Error(
        `${
          /**@type {typeof UnsafeHTMLDirective}*/ (this.constructor).directiveName
        }() can only be used in child bindings`
      )
    }
  }

  /** @param {string | typeof nothing | typeof noChange | undefined | null} value */
  render(value) {
    if (value === nothing || value == null) {
      this._templateResult = undefined
      return (this._value = value)
    }
    if (value === noChange) {
      return value
    }
    if (typeof value != "string") {
      throw new Error(
        `${/**@type {typeof UnsafeHTMLDirective}*/ (this.constructor).directiveName}() called with a non-string value`
      )
    }
    if (value === this._value) {
      return this._templateResult
    }
    this._value = value
    const strings = /** @type {*} */ ([value])
    strings.raw = strings
    // ПРЕДУПРЕЖДЕНИЕ: имитация TemplateResult таким образом крайне опасна. Сторонние директивы не должны этого делать.
    return (this._templateResult = {
      // Приведение к известному набору целых чисел, удовлетворяющих ResultType,
      // чтобы нам не пришлось экспортировать ResultType и возможно поощрять
      // такой паттерн. Это свойство должно оставаться неминифицированным.
      ["_$atomType$"]: /**@type {1 | 2}*/ (/**@type {typeof UnsafeHTMLDirective}*/ (this.constructor).resultType),
      strings: /**@type {TemplateStringsArray} */ (strings),
      values: []
    })
  }
}

/**
 * Отображает результат как HTML, а не как текст.
 *
 * Значения `undefined`, `null` и `nothing` приведут к отсутствию отображаемого
 * содержимого (пустой строке).
 *
 * Примечание: использование этой директивы с пользовательским вводом, который не был
 * предварительно очищен или экранирован, небезопасно, так как это может привести
 * к уязвимостям межсайтового скриптинга (XSS).
 */
export const unsafeHTML = directive(UnsafeHTMLDirective)
