import {directive} from "../directive.js"
import {UnsafeHTMLDirective} from "./unsafe-html.js"

const MATHML_RESULT = 3

class UnsafeMathMLDirective extends UnsafeHTMLDirective {
  static directiveName = "unsafeMath"
  static resultType = MATHML_RESULT
}

/**
 * Отображает результат как MathML, а не как текст.
 *
 * Значения `undefined`, `null` и `nothing` приведут к отсутствию содержимого
 * (пустая строка) при отображении.
 *
 * Примечание: небезопасно использовать с любыми пользовательскими данными, которые не были
 * предварительно очищены или экранированы, так как это может привести к уязвимостям
 * межсайтового скриптинга.
 */
export const unsafeMathML = directive(UnsafeMathMLDirective)
