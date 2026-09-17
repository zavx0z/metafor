import {noChange} from "../html.js"
import {directive, Directive} from "../directive.js"

// Сторожевой объект, указывающий что guard() ещё ничего не отрендерил
const initialValue = {}

class GuardDirective extends Directive {
  /**
   * @type {unknown}
   * @private
   */
  _previousValue = initialValue

  /**
   * @param {unknown} _value
   * @param {() => unknown} f
   * @returns {unknown}
   */
  render(_value, f) {
    return f()
  }
  /**
   * @param {import("../html.js").Part} _part
   * @param {import("../types/directives.js").DirectiveParameters<this>} params
   * @returns
   */
  update(_part, params) {
    const [value, f] = params
    if (Array.isArray(value)) {
      // Проверка массивов по элементам
      if (
        Array.isArray(this._previousValue) &&
        this._previousValue.length === value.length &&
        value.every((v, i) => v === /** @type {Array<unknown>} */ (this._previousValue)[i])
      ) {
        return noChange
      }
    } else if (this._previousValue === value) {
      // Проверка не-массивов на идентичность
      return noChange
    }

    // Копируем значение, если оно массив, чтобы если оно изменится, мы не забыли
    // какие были предыдущие значения.
    this._previousValue = Array.isArray(value) ? Array.from(value) : value
    return this.render(value, f)
  }
}

/**
 * Предотвращает повторное рендеринг шаблонной функции до тех пор, пока не изменится одно значение или массив значений.
 *
 * Значения сравниваются с предыдущими значениями с помощью строгого равенства (`===`), и
 * таким образом проверка не обнаружит изменения вложенных свойств внутри объектов или массивов.
 * Значения массивов сравниваются с предыдущими значениями по элементам с помощью строгого равенства.
 * Вложенные массивы также сравниваются только с помощью строгого равенства.
 *
 * Example:
 *
 * ```js
 * html`
 *   <div>
 *     ${guard([user.id, company.id], () => html`...`)}
 *   </div>
 * `
 * ```
 *
 * В этом случае шаблон перерендерится только если изменится `user.id` или `company.id`.
 *
 * guard() полезен с шаблонами, которые не изменяются, предотвращая дорогостоящую работу
 * до тех пор, пока не обновится данные.
 *
 * Example:
 *
 * ```js
 * html`
 *   <div>
 *     ${guard([immutableItems], () => immutableItems.map(i => html`${i}`))}
 *   </div>
 * `
 * ```
 *
 * В этом случае элементы перебираются только при изменении ссылки на массив.
 *
 * @param value значение для проверки перед повторным рендерингом
 * @param f шаблонная функция
 */
export const guard = directive(GuardDirective)
