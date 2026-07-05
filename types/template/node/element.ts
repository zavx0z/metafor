import type { AttrNodeElement } from "./index.ts"
import type { Attributes } from "../attribute/index.ts"
import type { NodeType } from "./index.ts"

/**
 * Узел HTML элемента в AST.
 * Представляет HTML тег с атрибутами и дочерними элементами.
 *
 * @group Nodes
 * @example Простой элемент
 * ```html
 * <div class="container" id="main">
 *   <h1>Заголовок</h1>
 *   <p>Текст</p>
 * </div>
 * ```
 *
 * Результат:
 * ```json
 * {
 *   "tag": "div",
 *   "type": "el",
 *   "string": {
 *     "class": "container",
 *     "id": "main"
 *   },
 *   "child": [
 *     {
 *       "tag": "h1",
 *       "type": "el",
 *       "child": [{ "type": "text", "value": "Заголовок" }]
 *     },
 *     {
 *       "tag": "p",
 *       "type": "el",
 *       "child": [{ "type": "text", "value": "Текст" }]
 *     }
 *   ]
 * }
 * ```
 *
 * @example Элемент с динамическими атрибутами
 * ```html
 * <button class="${fields.btnClass}" disabled="${!fields.isEnabled}">
 *   Нажми меня
 * </button>
 * ```
 */
export interface NodeElement extends Attributes {
  /** Имя HTML тега (например, `"div"`, `"button"`, `"meta-${mass.componentName}"`) */
  tag: string
  /** Тип узла — всегда `"el"` для HTML элементов */
  type: "el"
  /** Дочерние узлы элемента */
  child?: NodeType[]
}
export interface PartAttrElement extends AttrNodeElement {
  /** Тип узла — `"el"` для HTML элементов */
  type: "el"
}
