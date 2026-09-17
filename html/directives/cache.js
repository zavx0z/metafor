/**
 * @typedef {import('../types/part.js').ChildPart} ChildPart
 * @typedef {import('../types/part.js').Part} Part
 * @typedef {import('../types/part.js').RootPart} RootPart
 * @typedef {import('../types/html.js').TemplateResult} TemplateResult
 * @typedef {import('../types/html.js').CompiledTemplateResult} CompiledTemplateResult
 */
import {nothing, render} from "../html.js"
import {directive, Directive} from "../directive.js"
import {
  clearPart,
  getCommittedValue,
  insertPart,
  isCompiledTemplateResult,
  isTemplateResult,
  setCommittedValue
} from "../directive-helpers.js"

/**
 * Содержимое массива строк шаблона несовместимо между двумя
 * типами результатов шаблона, так как скомпилированный шаблон содержит подготовленную строку;
 * используйте возвращаемый массив строк шаблона только в качестве ключа кэша.
 * @param {TemplateResult | CompiledTemplateResult} result - Результат шаблона.
 * @returns {TemplateStringsArray} Массив строк шаблона.
 */
const getStringsFromTemplateResult = result =>
  isCompiledTemplateResult(result) ? result["_$atomType$"].h : result.strings

class CacheDirective extends Directive {
  /**
   * Кэш для хранения DOM-узлов и экземпляров TemplateInstance, созданных шаблонами.
   * @private
   * @type {WeakMap<TemplateStringsArray, RootPart>}
   */
  _templateCache = new WeakMap()
  /**
   * Хранит последнее значение, переданное в директиву.
   * @private
   * @type {TemplateResult | CompiledTemplateResult | undefined}
   */
  _value

  /** @param {import('../types/directives.js').PartInfo} partInfo - Информация о части. */
  constructor(partInfo) {
    super(partInfo)
  }

  /** @param {unknown} v - Значение. */
  render(v) {
    // Возвращаем массив значения, чтобы побудить @pkg/html создать ChildPart
    // для значения, которое мы можем переместить в кэш
    return [v]
  }

  /**
   * @param {ChildPart} containerPart - Часть контейнера.
   * @param {[unknown]} v - Значение.
   * */
  update(containerPart, [v]) {
    const _valueKey = isTemplateResult(this._value) ? getStringsFromTemplateResult(this._value) : null
    const vKey = isTemplateResult(v) ? getStringsFromTemplateResult(v) : null

    // Если предыдущее значение является TemplateResult, а новое значение нет,
    // или это другой шаблон по сравнению с предыдущим значением, перемещаем дочернюю часть
    // в кэш
    if (_valueKey !== null && (vKey === null || _valueKey !== vKey)) {
      // Это всегда массив, потому что мы возвращаем [v] в render()
      const partValue = /** @type {Array<ChildPart>} */ (getCommittedValue(containerPart))
      const childPart = /** @type {ChildPart} */ (partValue.pop())
      let cachedContainerPart = this._templateCache.get(_valueKey)
      if (cachedContainerPart === undefined) {
        const fragment = document.createDocumentFragment()
        cachedContainerPart = render(nothing, fragment)
        cachedContainerPart?.setConnected(false)
        this._templateCache.set(_valueKey, /** @type {RootPart}*/ (cachedContainerPart))
      }
      // Перемещаем в кэш
      setCommittedValue(/** @type {Part}*/ (cachedContainerPart), [childPart])
      insertPart(/** @type {ChildPart}*/ (cachedContainerPart), undefined, childPart)
    }
    // Если новое значение является TemplateResult, а предыдущее значение нет,
    // или это другой шаблон по сравнению с предыдущим значением, восстанавливаем
    // дочернюю часть из кэша
    if (vKey !== null) {
      if (_valueKey === null || _valueKey !== vKey) {
        const cachedContainerPart = this._templateCache.get(vKey)
        if (cachedContainerPart !== undefined) {
          // Перемещаем кэшированную часть обратно в значение части контейнера
          const partValue = /** @type {Array<ChildPart>} */ (getCommittedValue(cachedContainerPart))
          const cachedPart = /** @type {ChildPart} */ (partValue.pop())
          // Перемещаем кэшированную часть обратно в DOM
          clearPart(containerPart)
          insertPart(containerPart, undefined, cachedPart)
          setCommittedValue(containerPart, [cachedPart])
        }
      }
      // Поскольку vKey не null, v должен быть TemplateResult
      this._value = /** @type {TemplateResult | CompiledTemplateResult} */ (v)
    } else {
      this._value = undefined
    }
    return this.render(v)
  }
}

/**
 * Обеспечивает быстрое переключение между несколькими шаблонами путем кэширования DOM-узлов
 * и экземпляров TemplateInstance, созданных шаблонами.
 *
 * Пример:
 *
 * ```js
 * let checked = false;
 *
 * html`
 *   ${cache(checked ? html`input is checked` : html`input is not checked`)}
 * `
 * ```
 */
export const cache = /**@type { (v: unknown) => import("../directive.js").DirectiveResult<typeof CacheDirective>} */ (
  /** @type {unknown} */ (directive(CacheDirective))
)
