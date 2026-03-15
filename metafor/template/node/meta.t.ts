import type { ValueStatic, ValueDynamic, ValueVariable } from "../parser.t"
import type { AttrNodeElement } from "./index.t"
import type { Attributes } from "../attribute/index.t"
import type { NodeType } from "./index.t"

/**
 * Мета-узел в AST.
 *
 * Представляет meta-элемент.
 * Поддерживает создание компонентов с динамическими именами тегов.
 *
 * @group Nodes
 * @example Tег
 * ```html
 * <meta-for class="custom">
 * </meta-for>
 * ```
 *
 * @example Мета-элемент с mass и fields
 * ```html
 * <meta-widget mass=${mass.widgetConfig} fields=${fields.userData}>
 * </meta-widget>
 * ```
 *
 * Структура узла:
 * - `type` - всегда "meta" для мета-узлов
 * - `tag` - имя мета-тега
 * - `child` - дочерние элементы (опционально)
 * - Атрибуты: `event`, `boolean`, `array`, `string`, `style`
 * - Свойства: `mass`, `fields`
 */

export interface NodeMeta extends Attributes {
  /** Имя мета-тега */
  tag: ValueStatic
  /** Тип узла - всегда "meta" для мета-узлов */
  type: "meta"
  /** Дочерние элементы (опционально) */
  child?: NodeType[]
  /** mass свойство для meta-компонентов (передача mass объекта) */
  mass?: ValueStatic | ValueDynamic | ValueVariable
  /** fields свойство для meta-компонентов (передача fields объекта) */
  fields?: ValueStatic | ValueDynamic | ValueVariable
}
export interface PartAttrMeta extends AttrNodeElement {
  /** Тип узла */
  type: "meta"
  /** mass объекты */
  mass?: string
  /** fields объекты */
  fields?: string
}
