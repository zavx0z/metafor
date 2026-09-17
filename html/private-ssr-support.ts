import {Directive} from "./directive.js"

import {_$LH as p} from "./ssr.js"
import {type AttributePart, BooleanAttributePart, ChildPart, ElementPart, EventPart, noChange, PropertyPart, TemplateInstance} from "./html.js"
import type {DirectiveClass, DirectiveResult, PartInfo} from "./types/directives.js"
import type {Part} from "./types/part.js"
import type {Disconnectable} from "./types/html.js"

// Содержит либо минифицированное, либо неминифицированное имя метода `_$resolve` директивы
let resolveMethodName: Extract<keyof Directive, "_$resolve"> | null = null

/**
 * КОНЕЧНЫЕ ПОЛЬЗОВАТЕЛИ НЕ ДОЛЖНЫ ПОЛАГАТЬСЯ НА ЭТОТ ОБЪЕКТ.
 *
 * В настоящее время мы не создаем минифицированную сборку кода @pkg/html-ssr. Чтобы
 * сохранить ряд (иначе приватных) экспортов верхнего уровня в клиентском коде замангленными,
 * мы экспортируем объект _$LH, содержащий эти члены (или вспомогательные методы для доступа
 * к приватным полям этих членов), а затем повторно экспортируем их для использования в @pkg/html-ssr.
 * Это позволяет @pkg/html-ssr оставаться независимым от того, используется ли клиентский код
 * в режиме `dev` или `prod`.
 * @private
 */
export const _$LH = {
  boundAttributeSuffix: p._boundAttributeSuffix,
  marker: p._marker,
  markerMatch: p._markerMatch,
  HTML_RESULT: p._HTML_RESULT,
  getTemplateHtml: p._getTemplateHtml,
  overrideDirectiveResolve: (
    directiveClass: new (part: PartInfo) => Directive & { render(): unknown },
    resolveOverrideFn: (directive: Directive, values: unknown[]) => unknown
  ) =>
    class extends directiveClass {
      override _$resolve(this: Directive, _part: Part, values: unknown[]): unknown {
        return resolveOverrideFn(this, values)
      }
    },
  patchDirectiveResolve: (
    directiveClass: typeof Directive,
    resolveOverrideFn: (this: Directive, _part: Part, values: unknown[]) => unknown
  ) => {
    if (directiveClass.prototype._$resolve !== resolveOverrideFn) {
      resolveMethodName ??= directiveClass.prototype._$resolve.name as NonNullable<typeof resolveMethodName>
      for (let proto = directiveClass.prototype; proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
        if (proto.hasOwnProperty(resolveMethodName)) {
          proto[resolveMethodName] = resolveOverrideFn
          return
        }
      }
      // Ничего не было исправлено, что указывает на ошибку. Наиболее вероятная ошибка -
      // каким-то образом и минифицированный, и неминифицированный код @pkg прошел через этот
      // путь выполнения. Это возможно, так как @pkg-labs/ssr содержит свой собственный @pkg/html
      // модуль как зависимость для серверного рендеринга клиентского @pkg кода. Если
      // клиент содержит несколько дублирующихся @pkg модулей с минифицированными и
      // неминифицированными экспортами, мы в настоящее время не можем обработать оба варианта.
      throw new Error(
        `Внутренняя ошибка: Возможно, что режим разработки и производственный режим @quantum были смешаны во время SSR.`
      )
    }
  },
  setDirectiveClass(value: DirectiveResult, directiveClass: DirectiveClass) {
    // Это свойство должно остаться неминифицированным.
    value["_$atomDirective$"] = directiveClass
  },
  getAttributePartCommittedValue: (part: AttributePart, value: unknown, index: number | undefined) => {
    // Используйте сеттер части для разрешения директив/конкатенации нескольких частей
    // в конечное значение (захватывается путем передачи переопределения commitValue)
    let committedValue: unknown = noChange
    // Обратите внимание, что _commitValue не обязательно должен быть в `stableProperties`, потому что этот
    // метод запускается только на `AttributePart`, созданных @pkg-ssr, использующих ту же
    // версию библиотеки, что и этот файл
    part._commitValue = (value: unknown) => (committedValue = value)
    part._$setValue(value, part, index)
    return committedValue
  },
  connectedDisconnectable: (props?: object): Disconnectable => ({
    ...props,
    _$isConnected: true
  }),
  resolveDirective: p._resolveDirective,
  AttributePart: p._AttributePart,
  PropertyPart: p._PropertyPart as typeof PropertyPart,
  BooleanAttributePart: p._BooleanAttributePart as typeof BooleanAttributePart,
  EventPart: p._EventPart as typeof EventPart,
  ElementPart: p._ElementPart as typeof ElementPart,
  TemplateInstance: p._TemplateInstance as typeof TemplateInstance,
  isIterable: p._isIterable,
  ChildPart: p._ChildPart as typeof ChildPart
}
