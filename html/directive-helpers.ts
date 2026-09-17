import {_$LH} from "./ssr.js"
import type {CompiledTemplateResult, DirectiveParent, MaybeCompiledTemplateResult, UncompiledTemplateResult} from "./types/html.js"
import type {DirectiveClass, DirectiveResult} from "./types/directives.js"
import type {Part} from "./types/part.js"

type Primitive = null | undefined | boolean | number | string | symbol | bigint;

const {_ChildPart: ChildPart} = _$LH

type ChildPart = InstanceType<typeof ChildPart>;

const wrap = <T extends Node>(node: T) => node

/**
 * Проверяет, является ли значение примитивным типом.
 *
 * См. https://tc39.github.io/ecma262/#sec-typeof-operator
 */
export const isPrimitive = (value: unknown): value is Primitive =>
  value === null || (typeof value != 'object' && typeof value != 'function')

export const TemplateResultType = {
  HTML: 1,
  SVG: 2,
  MATHML: 3,
}

export type TemplateResultType =
  (typeof TemplateResultType)[keyof typeof TemplateResultType];

type IsTemplateResult = {
  (val: unknown): val is MaybeCompiledTemplateResult;
  <T extends TemplateResultType>(
    val: unknown,
    type: T
    // @ts-ignore
  ): val is UncompiledTemplateResult<T>;
};

/**
 * Проверяет, является ли значение TemplateResult или CompiledTemplateResult.
 */
export const isTemplateResult: IsTemplateResult = (
  value: unknown,
  type?: TemplateResultType
): value is UncompiledTemplateResult =>
  type === undefined
    ? // Это свойство должно оставаться неминифицированным.
    (value as UncompiledTemplateResult)?.['_$atomType$'] !== undefined
    : (value as UncompiledTemplateResult)?.['_$atomType$'] === type

/**
 * Проверяет, является ли значение CompiledTemplateResult.
 */
export const isCompiledTemplateResult = (
  value: unknown
): value is CompiledTemplateResult => {
  return (value as CompiledTemplateResult)?.['_$atomType$']?.h != null
}

/**
 * Проверяет, является ли значение DirectiveResult.
 */
export const isDirectiveResult = (value: unknown): value is DirectiveResult =>
  // Это свойство должно оставаться неминифицированным.
  (value as DirectiveResult)?.['_$atomDirective$'] !== undefined

/**
 * Получает класс Directive для DirectiveResult
 */
export const getDirectiveClass = (value: unknown): DirectiveClass | undefined =>
  // Это свойство должно оставаться неминифицированным.
  (value as DirectiveResult)?.['_$atomDirective$']


const createMarker = () => document.createComment('')

/**
 * Вставляет ChildPart в DOM указанного контейнера ChildPart, либо в конец контейнера ChildPart,
 * либо перед опциональным `refPart`.
 *
 * Это не добавляет часть к зафиксированному значению containerPart. Это должно быть сделано вызывающей стороной.
 *
 * @param containerPart Часть, в которую нужно добавить новый ChildPart
 * @param refPart Часть, перед которой нужно добавить новый ChildPart; если опущено, часть добавляется в конец `containerPart`
 * @param part Часть для вставки, или undefined для создания новой части
 */
export const insertPart = (
  containerPart: ChildPart,
  refPart?: ChildPart,
  part?: ChildPart
): ChildPart => {
  const container = wrap(containerPart._$startNode).parentNode!

  const refNode =
    refPart === undefined ? containerPart._$endNode : refPart._$startNode

  if (part === undefined) {
    const startNode = wrap(container).insertBefore(createMarker(), refNode)
    const endNode = wrap(container).insertBefore(createMarker(), refNode)
    part = new ChildPart(
      startNode,
      endNode,
      containerPart,
      containerPart.options
    )
  } else {
    const endNode = wrap(part._$endNode!).nextSibling
    const oldParent = part._$parent
    const parentChanged = oldParent !== containerPart
    if (parentChanged) {
      part._$reparentDisconnectables?.(containerPart)
      // Обратите внимание, что хотя `_$reparentDisconnectables` обновляет ссылку части
      // `_$parent` после отключения от текущего родителя, этот метод существует
      // только если присутствуют Disconnectables, поэтому нам нужно безусловно
      // установить его здесь
      part._$parent = containerPart
      // Поскольку геттер _$isConnected довольно затратный, читаем его только
      // когда мы знаем, что в поддереве есть директивы, которые нужно
      // уведомить
      let newConnectionState
      if (
        part._$notifyConnectionChanged !== undefined &&
        (newConnectionState = containerPart._$isConnected) !==
        oldParent!._$isConnected
      ) {
        part._$notifyConnectionChanged(newConnectionState)
      }
    }
    if (endNode !== refNode || parentChanged) {
      let start: Node | null = part._$startNode
      while (start !== endNode) {
        const n: Node | null = wrap(start!).nextSibling
        wrap(container).insertBefore(start!, refNode)
        start = n
      }
    }
  }

  return part
}

/**
 * Устанавливает значение части.
 *
 * Обратите внимание, что это должно использоваться только для установки/обновления значения
 * частей, созданных пользователем (т.е. тех, что созданы с помощью `insertPart`);
 * это не должно использоваться директивами для установки значения части контейнера директивы.
 * Директивы должны возвращать значение из `update`/`render` для обновления состояния своей части.
 *
 * Для директив, которым требуется установка значения их части асинхронно,
 * они должны расширять `AsyncDirective` и вызывать `this.setValue()`.
 *
 * @param part Часть для установки
 * @param value Значение для установки
 * @param index Для `AttributePart`, индекс для установки
 * @param directiveParent Используется внутренне; не должно устанавливаться пользователем
 */
export const setChildPartValue = <T extends ChildPart>(
  part: T,
  value: unknown,
  directiveParent: DirectiveParent = part
): T => {
  part._$setValue(value, directiveParent)
  return part
}

// Сторожевое значение, которое никогда не может появиться как значение части,
// кроме случаев, когда оно установлено через live(). Используется для принудительного
// провала проверки на изменения и вызова повторного рендеринга.
const RESET_VALUE = {}

/**
 * Устанавливает зафиксированное значение ChildPart напрямую без запуска
 * этапа фиксации части.
 *
 * Это полезно в случаях, когда директиве нужно обновить часть таким образом,
 * чтобы следующее обновление обнаружило изменение значения или нет.
 * Когда значение опущено, следующее обновление гарантированно будет
 * обнаружено как изменение.
 *
 * @param part
 * @param value
 */
export const setCommittedValue = (part: Part, value: unknown = RESET_VALUE) =>
  (part._$committedValue = value)

/**
 * Возвращает зафиксированное значение ChildPart.
 *
 * Зафиксированное значение используется для обнаружения изменений и эффективных
 * обновлений части. Оно может отличаться от значения, установленного шаблоном
 * или директивой в случаях, когда значение шаблона преобразуется перед фиксацией.
 *
 * - `TemplateResult` фиксируются как `TemplateInstance`
 * - Итерируемые объекты фиксируются как `Array<ChildPart>`
 * - Все остальные типы фиксируются как значение шаблона или значение,
 *   возвращенное или установленное директивой.
 *
 * @param part
 */
export const getCommittedValue = (part: ChildPart) => part._$committedValue

/**
 * Удаляет ChildPart из DOM, включая все его содержимое.
 *
 * @param part Часть для удаления
 */
export const removePart = (part: ChildPart) => {
  part._$notifyConnectionChanged?.(false, true)
  let start: ChildNode | null = part._$startNode
  const end: ChildNode | null = wrap(part._$endNode!).nextSibling
  while (start !== end) {
    const n: ChildNode | null = wrap(start!).nextSibling;
    (wrap(start!) as ChildNode).remove()
    start = n
  }
}

export const clearPart = (part: ChildPart) => {
  part._$clear()
}
