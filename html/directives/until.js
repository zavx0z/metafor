import {noChange} from "../html.js"
import {isPrimitive} from "../directive-helpers.js"
import {directive, AsyncDirective} from "../async-directive.js"
import {Pauser, PseudoWeakRef} from "./private-async-helpers.js"

/**
 * Проверяет, является ли значение Promise.
 * @param {*} x - Проверяемое значение.
 * @returns {boolean} - true, если значение является Promise.
 */
const isPromise = x => {
  return !isPrimitive(x) && typeof x?.then === "function"
}

// Практически бесконечное значение, но в пределах SMI.
const _infinity = 0x3fffffff

/**
 * Класс директивы Until.
 * @extends AsyncDirective
 */
export class UntilDirective extends AsyncDirective {
  /**
   * @param {import('../types/directives.js').PartInfo} part
   */
  constructor(part) {
    super(part)
    /** @type {number} */
    this.__lastRenderedIndex = _infinity
    /** @type {Array<*>} */
    this.__values = []
    /** @type {PseudoWeakRef<UntilDirective>} */
    this.__weakThis = new PseudoWeakRef(this)
    /** @type {Pauser} */
    this.__pauser = new Pauser()
  }

  /**
   * Рендерит первое значение, не являющееся Promise.
   * @param {...*} args - Значения для рендера.
   * @returns {*} - Первое синхронное значение или noChange.
   */
  render(...args) {
    return args.find(x => !isPromise(x)) ?? noChange
  }

  /**
   * Обновляет состояние директивы.
   * @param {import('../html.js').Part} _part - Часть для обновления.
   * @param {Array<*>} args - Новые значения для обработки.
   * @returns {*} - Результат рендера.
   */
  update(_part, args) {
    const previousValues = this.__values
    let previousLength = previousValues.length
    this.__values = args

    const weakThis = this.__weakThis
    const pauser = this.__pauser

    if (!this.isConnected) {
      this.disconnected()
    }

    for (let i = 0; i < args.length; i++) {
      if (i > this.__lastRenderedIndex) {
        break
      }

      const value = args[i]

      if (!isPromise(value)) {
        this.__lastRenderedIndex = i
        return value
      }

      if (i < previousLength && value === previousValues[i]) {
        continue
      }

      this.__lastRenderedIndex = _infinity
      previousLength = 0

      Promise.resolve(value).then(async result => {
        while (pauser.get()) {
          await pauser.get()
        }
        const _this = weakThis.deref()
        if (_this !== undefined) {
          const index = _this.__values.indexOf(value)
          if (index > -1 && index < _this.__lastRenderedIndex) {
            _this.__lastRenderedIndex = index
            _this.setValue(result)
          }
        }
      })
    }

    return noChange
  }

  /**
   * Вызывается при отключении директивы.
   */
  disconnected() {
    this.__weakThis.disconnect()
    this.__pauser.pause()
  }

  /**
   * Вызывается при повторном подключении директивы.
   */
  reconnected() {
    this.__weakThis.reconnect(this)
    this.__pauser.resume()
  }
}

/**
 * Рендер одного из значений (включая Promise) в компонент.
 * Значения рендерятся в порядке приоритета.
 */
export const until = directive(/** @type {import("../directive.js").DirectiveClass} */(UntilDirective))
// * @function
// * @returns {import('../async-directive.js').DirectiveResult<typeof UntilDirective>}
