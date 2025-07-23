import type {Disconnectable, Part} from './html.t'

/**
 * Интерфейс класса-директивы (конструктор).
 */
export interface DirectiveClass {
  new (part: PartInfo): Directive
}

/**
 * Вспомогательный тип для извлечения сигнатуры метода render() из класса-директивы.
 * Используется для типизации функции-директивы.
 */
export type DirectiveParameters<C extends Directive> = Parameters<C['render']>

/**
 * Результат вызова функции-директивы. Не выполняет саму директиву, а только
 * возвращает объект с аргументами для дальнейшей обработки.
 */
export interface DirectiveResult<C extends DirectiveClass = DirectiveClass> {
  /**
   * Это свойство не должно быть минифицировано.
   * @internal
   */
  ['_$htmlDirective$']: C
  /** @internal */
  values: DirectiveParameters<InstanceType<C>>
}

/**
 * Типы частей шаблона (PartType).
 */
export const PartType = {
  ATTRIBUTE: 1,
  CHILD: 2,
  PROPERTY: 3,
  BOOLEAN_ATTRIBUTE: 4,
  EVENT: 5,
  ELEMENT: 6,
} as const

export type PartType = (typeof PartType)[keyof typeof PartType]

/**
 * Информация о части типа CHILD.
 */
export interface ChildPartInfo {
  readonly type: typeof PartType.CHILD
}

/**
 * Информация о части типа ATTRIBUTE, PROPERTY, BOOLEAN_ATTRIBUTE, EVENT.
 */
export interface AttributePartInfo {
  readonly type:
    | typeof PartType.ATTRIBUTE
    | typeof PartType.PROPERTY
    | typeof PartType.BOOLEAN_ATTRIBUTE
    | typeof PartType.EVENT
  readonly strings?: ReadonlyArray<string>
  readonly name: string
  readonly tagName: string
}

/**
 * Информация о части типа ELEMENT.
 */
export interface ElementPartInfo {
  readonly type: typeof PartType.ELEMENT
}

/**
 * Информация о части шаблона, к которой привязана директива.
 *
 * Используется для проверки, что директива применяется к корректной части шаблона.
 */
export type PartInfo = ChildPartInfo | AttributePartInfo | ElementPartInfo

/**
 * Создаёт пользовательскую функцию-директиву из класса-директивы.
 * Эта функция имеет те же параметры, что и render() директивы.
 */
export const directive =
  <C extends DirectiveClass>(c: C) =>
  (...values: DirectiveParameters<InstanceType<C>>): DirectiveResult<C> => ({
    // Это свойство не должно быть минифицировано.
    ['_$htmlDirective$']: c,
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
  _$disconnectableChildren?: Set<Disconnectable>
  // Это свойство не должно быть минифицировано.
  //@internal
  ['_$notifyDirectiveConnectionChanged']?(isConnected: boolean): void

  constructor(_partInfo: PartInfo) {}

  // См. комментарий в интерфейсе Disconnectable, почему это геттер
  get _$isConnected() {
    return this._$parent._$isConnected
  }

  /** @internal */
  _$initialize(
    part: Part,
    parent: Disconnectable,
    attributeIndex: number | undefined
  ) {
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
