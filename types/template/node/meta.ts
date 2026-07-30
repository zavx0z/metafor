import type { ValueDynamic, ValueVariable } from "../parser.ts"
import type { AttrNodeElement } from "./index.ts"
import type { Attributes } from "../attribute/index.ts"
import type { NodeType } from "./index.ts"

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
 * @example Мета-элемент с Mass handle, Energy entity и Fields
 * ```html
 * <meta-widget mass=${mass.widgetConfig} energy=${energy.channel} fields=${fields.userData}>
 * </meta-widget>
 * ```
 *
 * Структура узла:
 * - `type` - всегда "meta" для мета-узлов
 * - `tag` - имя мета-тега
 * - `child` - дочерние элементы (опционально)
 * - Атрибуты: `event`, `boolean`, `array`, `string`, `style`
 * - Свойства: `mass`, `energy`, `fields`
 */

export interface NodeMeta extends Attributes {
  /** Имя мета-тега */
  tag: string
  /** Тип узла - всегда "meta" для мета-узлов */
  type: "meta"
  /** Канонический src независимого peer Meta-репозитория: owner/repository. */
  src: string | ValueDynamic | ValueVariable
  /** Дочерние элементы (опционально) */
  child?: NodeType[]
  /** Mass binding для передачи объявленного handle дочернему Atom */
  mass?: string | ValueDynamic | ValueVariable
  /** energy свойство для meta-компонентов (передача живых Energy-сущностей) */
  energy?: string | ValueDynamic | ValueVariable
  /** fields свойство для meta-компонентов (передача fields объекта) */
  fields?: string | ValueDynamic | ValueVariable
}
export interface PartAttrMeta extends AttrNodeElement {
  /** Тип узла */
  type: "meta"
  /** src вида owner/repository; опционален, т.к. извлекается из string */
  src?: string | ValueDynamic | ValueVariable
  /** Mass handle bindings */
  mass?: string
  /** energy объекты */
  energy?: string
  /** fields объекты */
  fields?: string
}
