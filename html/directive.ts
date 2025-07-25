import type { Disconnectable, Part } from "./html.t"
import type { DirectiveResult, PartInfo, DirectiveClass, DirectiveParameters } from "./directive.t"
import { PartType } from "./directive.t"
export type { PartInfo, DirectiveParameters }
export { PartType }

/**
 * Создаёт пользовательскую функцию-директиву из класса-директивы.
 * Эта функция имеет те же параметры, что и render() директивы.
 */
export const directive =
  <C extends DirectiveClass>(c: C) =>
  (...values: unknown[]): DirectiveResult<C> => ({
    // Это свойство не должно быть минифицировано.
    ["_$htmlDirective$"]: c,
    values,
  })

/**
 * Базовый класс для создания пользовательских директив.
 * Пользователь должен наследовать этот класс, реализовать методы render и/или update,
 * и передать свой подкласс в функцию directive.
 */
export abstract class Directive implements Disconnectable {
  //@internal
  __part!: Part
  //@internal
  __attributeIndex: number | undefined
  //@internal
  __directive?: Directive

  //@internal
  _$parent!: Disconnectable

  // Эти поля будут только у AsyncDirective
  //@internal
  _$disconnectableChildren?: Set<Disconnectable>;
  // Это свойство не должно быть минифицировано.
  //@internal
  ["_$notifyDirectiveConnectionChanged"]?(isConnected: boolean): void

  constructor(_partInfo: PartInfo) {}

  // См. комментарий в интерфейсе Disconnectable, почему это геттер
  get _$isConnected() {
    return this._$parent._$isConnected
  }

  /** @internal */
  _$initialize(part: Part, parent: Disconnectable, attributeIndex: number | undefined) {
    this.__part = part
    this._$parent = parent
    this.__attributeIndex = attributeIndex
  }
  /** @internal */
  _$resolve(part: Part, props: Array<unknown>): unknown {
    return this.update(part, props)
  }

  /**
   * Метод, который должен быть реализован в пользовательской директиве.
   * Возвращает значение для вставки в шаблон.
   */
  abstract render(...props: Array<unknown>): unknown

  /**
   * Метод обновления директивы. По умолчанию вызывает render().
   */
  update(_part: Part, props: Array<unknown>): unknown {
    return this.render(...props)
  }
}
