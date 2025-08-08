import type { Part, DirectiveParent, CompiledTemplateResult, UncompiledTemplateResult } from "./index.t"
import { _$LH } from "."
import type { DirectiveResult, DirectiveClass, PartInfo, AttributePartInfo } from "./directive.t"

const { _ChildPart: ChildPart } = _$LH

type ChildPart = InstanceType<typeof ChildPart>

const ENABLE_SHADYDOM_NOPATCH = true

const wrap = (node: Node): Node => {
  if (
    ENABLE_SHADYDOM_NOPATCH &&
    (window as any).ShadyDOM?.inUse &&
    (window as any).ShadyDOM?.noPatch === true &&
    (window as any).ShadyDOM?.wrap
  ) {
    return (window as any).ShadyDOM.wrap(node)
  }
  return node
}

/**
 * Проверяет, является ли значение примитивным.
 *
 * См. https://tc39.github.io/ecma262/#sec-typeof-operator
 */
export const isPrimitive = (value: unknown): value is null | undefined | boolean | number | string | symbol | bigint =>
  value === null || (typeof value != "object" && typeof value != "function")

export const TemplateResultType = {
  HTML: 1,
  SVG: 2,
  MATHML: 3,
} as const

/**
 * Проверяет, является ли значение TemplateResult или CompiledTemplateResult.
 */
export const isTemplateResult = (
  value: unknown,
  type?: (typeof TemplateResultType)[keyof typeof TemplateResultType]
): value is UncompiledTemplateResult =>
  type === undefined
    ? // Это свойство не должно быть минифицировано.
      (value as UncompiledTemplateResult)?.["_$htmlType$"] !== undefined
    : (value as UncompiledTemplateResult)?.["_$htmlType$"] === type

/**
 * Проверяет, является ли значение CompiledTemplateResult.
 */
export const isCompiledTemplateResult = (value: unknown): value is CompiledTemplateResult => {
  return (value as CompiledTemplateResult)?.["_$htmlType$"]?.h != null
}

/**
 * Проверяет, является ли значение DirectiveResult.
 */
export const isDirectiveResult = (value: unknown): value is DirectiveResult =>
  // Это свойство не должно быть минифицировано.
  (value as DirectiveResult)?.["_$htmlDirective$"] !== undefined

/**
 * Получает класс директивы для DirectiveResult
 */
export const getDirectiveClass = (value: unknown): DirectiveClass | undefined =>
  // Это свойство не должно быть минифицировано.
  (value as DirectiveResult)?.["_$htmlDirective$"]

/**
 * Проверяет, имеет ли часть только одно выражение без строк для интерполяции между ними.
 *
 * Только AttributePart и PropertyPart могут иметь множественные выражения.
 * Части с множественными выражениями имеют свойство `strings`, а части с одним выражением - нет.
 */
export const isSingleExpression = (part: PartInfo) => (part as AttributePartInfo).strings === undefined

const createMarker = () => document.createComment("")

/**
 * Вставляет ChildPart в DOM указанной контейнерной ChildPart, либо в конец
 * контейнерной ChildPart, либо перед опциональной `refPart`.
 *
 * Это не добавляет часть к закоммиченному значению containerPart. Это должно
 * быть сделано вызывающим кодом.
 *
 * @param containerPart Часть, в которую добавляется новая ChildPart
 * @param refPart Часть, перед которой добавляется новая ChildPart; при пропуске
 *     часть добавляется в конец `containerPart`
 * @param part Часть для вставки, или undefined для создания новой части
 */
export const insertPart = (containerPart: ChildPart, refPart?: ChildPart, part?: ChildPart): ChildPart => {
  const container = wrap(containerPart._$startNode).parentNode!

  const refNode = refPart === undefined ? containerPart._$endNode : refPart._$startNode

  if (part === undefined) {
    const startNode = wrap(container).insertBefore(createMarker(), refNode)
    const endNode = wrap(container).insertBefore(createMarker(), refNode)
    part = new ChildPart(startNode, endNode, containerPart, containerPart.options)
  } else {
    const endNode = wrap(part._$endNode!).nextSibling
    const oldParent = part._$parent
    const parentChanged = oldParent !== containerPart
    if (parentChanged) {
      part._$reparentDisconnectables?.(containerPart)
      // Обратите внимание, что хотя `_$reparentDisconnectables` обновляет ссылку
      // `_$parent` части после отвязки от текущего родителя, этот метод
      // существует только если присутствуют Disconnectables, поэтому нам нужно
      // безусловно установить его здесь
      part._$parent = containerPart
      // Поскольку геттер _$isConnected довольно дорогой, читаем его только
      // один раз, когда знаем, что поддерево имеет директивы, которые нужно
      // уведомить
      let newConnectionState
      if (
        part._$notifyConnectionChanged !== undefined &&
        (newConnectionState = containerPart._$isConnected) !== oldParent!._$isConnected
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

  // После перемещения/создания части синхронизируем положения meta-* акторов внутри диапазона части
  try {
    const start = (part as any)._$startNode as Node
    const end = (part as any)._$endNode as Node
    let node: Node | null = start.nextSibling
    const stack: Node[] = []
    const visit = (el: Element) => {
      const tag = el.tagName?.toLowerCase?.()
      if (tag && tag.startsWith("meta-")) {
        try {
          ;(el as any).__syncLocation?.()
        } catch {}
      }
      // Обходим потомков
      for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
        visit(child)
      }
    }
    while (node && node !== end) {
      if (node.nodeType === Node.ELEMENT_NODE) visit(node as Element)
      node = node.nextSibling
    }
  } catch {}

  return part
}

/**
 * Устанавливает значение части.
 *
 * Обратите внимание, что это должно использоваться только для установки/обновления
 * значения пользовательских частей (т.е. тех, которые созданы с помощью `insertPart`);
 * это не должно использоваться директивами для установки значения контейнерной
 * части директивы. Директивы должны возвращать значение из `update`/`render`
 * для обновления состояния части.
 *
 * Для директив, которые требуют асинхронной установки значения части, они должны
 * расширять `AsyncDirective` и вызывать `this.setValue()`.
 *
 * @param part Часть для установки
 * @param value Значение для установки
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

// Сентинельное значение, которое никогда не может появиться как значение части,
// кроме случаев, когда оно установлено live(). Используется для принудительного
// сбоя проверки изменений и вызова перерендеринга.
const RESET_VALUE = {}

/**
 * Устанавливает закоммиченное значение ChildPart напрямую без запуска
 * стадии коммита части.
 *
 * Это полезно в случаях, когда директива должна обновить часть так, чтобы
 * следующее обновление обнаружило изменение значения или нет. Когда значение
 * пропущено, следующее обновление гарантированно будет обнаружено как изменение.
 *
 * @param part
 * @param value
 */
export const setCommittedValue = (part: Part, value: unknown = RESET_VALUE) => (part._$committedValue = value)

/**
 * Возвращает закоммиченное значение ChildPart.
 *
 * Закоммиченное значение используется для обнаружения изменений и эффективных
 * обновлений части. Оно может отличаться от значения, установленного шаблоном
 * или директивой в случаях, когда значение шаблона преобразуется перед коммитом.
 *
 * - `TemplateResult` коммитятся как `TemplateInstance`
 * - Итерируемые объекты коммитятся как `Array<ChildPart>`
 * - Все остальные типы коммитятся как значение шаблона или значение, возвращенное
 *   или установленное директивой.
 *
 * @param part
 */
export const getCommittedValue = (part: ChildPart) => part._$committedValue

/**
 * Удаляет ChildPart из DOM, включая все её содержимое и маркеры.
 *
 * Примечание: Единственное различие между этим и clearPart() в том, что это также
 * удаляет начальный узел части. Это означает, что ChildPart должна владеть своим
 * начальным узлом, т.е. это должен быть маркерный узел специально для этой части,
 * а не якорь из окружающего содержимого.
 *
 * @param part Часть для удаления
 */
export const removePart = (part: ChildPart) => {
  part._$clear()
  part._$startNode.remove()
}

export const clearPart = (part: ChildPart) => {
  part._$clear()
}
