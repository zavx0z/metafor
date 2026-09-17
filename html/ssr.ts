import {
  AttributePart,
  BooleanAttributePart, boundAttributeSuffix,
  ChildPart,
  ElementPart,
  EventPart, getTemplateHtml, HTML_RESULT, isIterable, marker, markerMatch,
  PropertyPart, resolveDirective,
  TemplateInstance
} from "./html.js"

/** КОНЕЧНЫЕ ПОЛЬЗОВАТЕЛИ НЕ ДОЛЖНЫ ПОЛАГАТЬСЯ НА ЭТОТ ОБЪЕКТ.
 *  Приватные экспорты для использования другими пакетами @pkg, не предназначены для использования внешними пользователями. */
export const _$LH = {
  // Used in ssr
  _boundAttributeSuffix: boundAttributeSuffix,
  _marker: marker,
  _markerMatch: markerMatch,
  _HTML_RESULT: HTML_RESULT,
  _getTemplateHtml: getTemplateHtml,
  // Used in tests and private-ssr-support
  _TemplateInstance: TemplateInstance,
  _isIterable: isIterable,
  _resolveDirective: resolveDirective,
  _ChildPart: ChildPart,
  _AttributePart: AttributePart,
  _BooleanAttributePart: BooleanAttributePart,
  _EventPart: EventPart,
  _PropertyPart: PropertyPart,
  _ElementPart: ElementPart
}
