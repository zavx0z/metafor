import {directive} from "../directive.js"
import {UnsafeHTMLDirective} from "./unsafe-html.js"

const SVG_RESULT = 2

class UnsafeSVGDirective extends UnsafeHTMLDirective {
  static directiveName = "unsafeSVG"
  static resultType = SVG_RESULT
}

/**
 * Отображает результат как SVG, а не как текст.
 *
 * Значения `undefined`, `null` и `nothing` приведут к отсутствию содержимого
 * (пустой строке) при отображении.
 *
 * Примечание: небезопасно использовать с любыми пользовательскими данными, которые не были
 * предварительно очищены или экранированы, так как это может привести к уязвимостям
 * межсайтового скриптинга.
 */
export const unsafeSVG = directive(UnsafeSVGDirective)
