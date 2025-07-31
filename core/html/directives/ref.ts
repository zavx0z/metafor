/**
 * Директива ref
 * @module HTML
 */

import { nothing, type ElementPart } from "../html.js"

import { directive, AsyncDirective } from "../async-directive.js"

/**
 * Создаёт новый объект Ref, который является контейнером для ссылки на элемент.
 */
export const createRef = <T = Element>() => new Ref<T>()

/**
 * Объект, который хранит значение ref.
 */
class Ref<T = Element> {
  /**
   * Текущее значение элемента ref, либо `undefined`, если ref больше не отрисован.
   */
  readonly value?: T
}

export type { Ref }

interface RefInternal {
  value: Element | undefined
}

// Когда для ref используются колбэки, эта карта отслеживает последнее значение, с которым был вызван колбэк,
// чтобы гарантировать, что директива не очистит ref, если ref уже был отрисован в новом месте.
// Используется двойное ключевание по context (`options.host`) и по колбэку, так как методы класса автоматически
// привязываются к options.host.
const lastElementForContextAndCallback = new WeakMap<object, WeakMap<Function, Element | undefined>>()

export type RefOrCallback<T = Element> = Ref<T> | ((el: T | undefined) => void)

class RefDirective extends AsyncDirective {
  private _element?: Element
  private _ref?: RefOrCallback | undefined
  private _context?: object | undefined

  render(_ref?: RefOrCallback) {
    return nothing
  }

  override update(part: ElementPart, [ref]: Parameters<this["render"]>) {
    const refChanged = ref !== this._ref
    if (refChanged && this._ref !== undefined) {
      // Переданный в директиву ref изменился;
      // сбрасываем предыдущее значение ref
      this._updateRefValue(undefined)
    }
    if (refChanged || this._lastElementForRef !== this._element) {
      // Либо получен новый ref, либо это первый рендер;
      // сохраняем ref/элемент и обновляем значение ref
      this._ref = ref ?? undefined
      this._context = part.options?.host ?? undefined
      this._updateRefValue((this._element = part.element))
    }
    return nothing
  }

  private _updateRefValue(element: Element | undefined) {
    if (!this.isConnected) {
      element = undefined
    }
    if (typeof this._ref === "function") {
      // Если текущий ref уже был вызван с предыдущим значением, вызываем с
      // `undefined`. Это делается для того, чтобы колбэки вызывались согласованно
      // независимо от того, перемещается ли ref вверх по дереву (в этом случае он
      // был бы вызван с новым значением до того, как предыдущее сбросится) или вниз
      // (где он сбрасывается до установки нового значения). Обратите внимание, что
      // поиск элемента осуществляется по context и по колбэку, так как допускается
      // передача непривязанных функций, которые вызываются на options.host, и такие
      // случаи считаются уникальными "экземплярами" функции.
      const context = this._context ?? globalThis
      let lastElementForCallback = lastElementForContextAndCallback.get(context)
      if (lastElementForCallback === undefined) {
        lastElementForCallback = new WeakMap()
        lastElementForContextAndCallback.set(context, lastElementForCallback)
      }
      if (lastElementForCallback.get(this._ref) !== undefined) {
        this._ref.call(this._context, undefined)
      }
      lastElementForCallback.set(this._ref, element)
      // Вызываем ref с новым значением элемента
      if (element !== undefined) {
        this._ref.call(this._context, element)
      }
    } else {
      ;(this._ref as RefInternal)!.value = element
    }
  }

  private get _lastElementForRef() {
    return typeof this._ref === "function"
      ? lastElementForContextAndCallback.get(this._context ?? globalThis)?.get(this._ref)
      : this._ref?.value
  }

  override disconnected() {
    // Очищаем только если наш элемент всё ещё находится в ref (т.е. другой
    // экземпляр директивы не отрисовал свой элемент в этот ref до нас);
    // это происходит только при очистке директивы (не при ручном отключении)
    if (this._lastElementForRef === this._element) {
      this._updateRefValue(undefined)
    }
  }

  override reconnected() {
    // Если директива была отключена вручную, можно безопасно вернуть элемент в ref,
    // так как никакой рендеринг не мог изменить его состояние
    this._updateRefValue(this._element)
  }
}

/**
 * Устанавливает значение объекта Ref или вызывает ref-колбэк с элементом, к которому он привязан.
 *
 * Объект Ref выступает контейнером для ссылки на элемент. Ref-колбэк — это функция,
 * принимающая элемент в качестве единственного аргумента.
 *
 * Директива ref устанавливает значение объекта Ref или вызывает ref-колбэк во время рендера,
 * если связанный элемент изменился.
 *
 * Примечание: если ref-колбэк отрисован в другую позицию или удалён при следующем рендере,
 * он сначала будет вызван с undefined, а затем — с новым элементом (если он есть).
 *
 * ```js
 * // Использование объекта Ref
 * const inputRef = createRef();
 * render(html`<input ${ref(inputRef)}>`, container);
 * inputRef.value.focus();
 *
 * // Использование колбэка
 * const callback = (inputElement) => inputElement.focus();
 * render(html`<input ${ref(callback)}>`, container);
 * ```
 */
export const ref = directive(RefDirective)

/**
 * Тип класса, реализующего эту директиву. Необходим для именования типа возвращаемого значения директивы.
 */
export type { RefDirective }
