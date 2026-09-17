import {nothing} from "../html.js"
import {directive, Directive} from "../directive.js"
import {setCommittedValue} from "../directive-helpers.js"

class Keyed extends Directive {
  key = /**@type {unknown} */ (nothing)

  /**
   * @param {unknown} k
   * @param {unknown} v
   * @return {unknown}
   */
  render(k, v) {
    this.key = k
    return v
  }

  /**
   *
   * @param {import("../types/part.js").ChildPart} part
   * @param {import("../types/directives.js").DirectiveParameters<this>} param1
   * @returns
   */
  update(part, [k, v]) {
    if (k !== this.key) {
      // Очищаем часть перед возвратом значения. Форма setCommittedValue с одним
      // аргументом устанавливает значение в сигнальное, что принудительно
      // вызывает коммит при следующей отрисовке.
      setCommittedValue(part)
      this.key = k
    }
    return v
  }
}

/**
 * Связывает отображаемое значение с уникальным ключом. Когда ключ меняется,
 * предыдущий DOM удаляется и уничтожается перед отрисовкой следующего значения,
 * даже если значение - например шаблон - остается тем же.
 *
 * Это полезно для принудительной повторной отрисовки компонентов с состоянием
 * или при работе с кодом, который ожидает, что новые данные создадут новые
 * HTML элементы, например в некоторых анимационных техниках.
 */
export const keyed = directive(Keyed)
