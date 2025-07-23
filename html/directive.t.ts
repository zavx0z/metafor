/**
 * Типы для directive.ts
 * @packageDocumentation
 */

import type {Directive} from './directive.js'

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
