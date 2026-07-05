import type { PartAttrCondition } from "./condition.ts"
import type { PartAttrElement } from "./element.ts"
import type { NodeType } from "./index.ts"
import type { PartAttrLogical } from "./logical.ts"
import type { PartAttrMeta } from "./meta.ts"
import type { PartText } from "./text.ts"

/**
 * Узел map операции в AST.
 * Представляет итерацию по массиву данных с дочерними элементами.
 *
 * ## Формат путей в map
 *
 * - `[item]` — ссылка на текущий элемент итерации
 * - `[index]` — индекс текущего элемента
 * - `../[item]` — ссылка на элемент родительского map (для вложенных итераций)
 *
 * ## Деструктуризация
 *
 * При деструктуризации объекта параметры map содержат имена свойств:
 * - `.map((item) => ...)` → `params: ["item"]`, `isDestructured: false`
 * - `.map(({ title, id }) => ...)` → `params: ["title", "id"]`, `isDestructured: true`
 *
 * @group Nodes
 * @example Итерация с индексом
 * ```html
 * <ul>
 *   ${mass.items.map((item, index) => html`
 *     <li class=${index % 2 === 0 ? 'even' : 'odd'}>
 *       ${index + 1}. ${item.name}
 *     </li>
 *   `)}
 * </ul>
 * ```
 *
 * Результат:
 * ```json
 * {
 *   "tag": "ul",
 *   "type": "el",
 *   "child": [
 *     {
 *       "type": "map",
 *       "data": "/mass/items",
 *       "child": [
 *         {
 *           "tag": "li",
 *           "type": "el",
 *           "string": {
 *             "class": {
 *               "data": ["index", "item.name"],
 *               "expr": "${[0]} % 2 === 0 ? 'even' : 'odd'"
 *             }
 *           },
 *           "child": [
 *             {
 *               "type": "text",
 *               "data": ["index", "item.name"],
 *               "expr": "${[0] + 1}. ${[1]}"
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 * ```
 *
 * @example Вложенная итерация
 * ```html
 * <div>
 *   ${mass.categories.map(category => html`
 *     <section>
 *       <h1>${category.name}</h1>
 *       ${category.products.map(product => html`
 *         <div>${product.name}</div>
 *       `)}
 *     </section>
 *   `)}
 * </div>
 * ```
 */
export interface NodeMap {
  /** Тип узла — всегда `"map"` для map операций */
  type: "map"
  /** Путь к массиву данных для итерации (например, `"/fields/users"`, `"/mass/products"`) */
  data: string
  /** Дочерние узлы, которые будут повторены для каждого элемента массива */
  child: NodeType[]
}

/**
 * Контекст map операции для парсера.
 * Используется для отслеживания текущей итерации при парсинге вложенных структур.
 */
export interface ParseMapContext {
  /** Путь к массиву данных (например, `"/mass/items"`) */
  path: string
  /**
   * Параметры map функции.
   * - Для `.map((item) => ...)` → `["item"]`
   * - Для `.map(({ title, id }) => ...)` → `["title", "id"]` (деструктуризация)
   */
  params: string[]
  /** `true` если используется деструктуризация объекта */
  isDestructured: boolean
  /** Уровень вложенности map (0 для корневого, 1 для вложенного и т.д.) */
  level: number
}
export interface TokenMapClose { kind: "map-close" }
export interface TokenMapOpen { kind: "map-open"; sig: string }
export interface PartAttrMap {
  /** Тип узла — `"map"` для map операций */
  type: "map"
  /** Исходный текст map-выражения (например, `"mass.items.map(item => html`...`)"`) */
  text: string
  /** Дочерние элементы, повторяемые для каждого элемента коллекции */
  child: (PartAttrElement | PartText | PartAttrMap | PartAttrMeta | PartAttrCondition | PartAttrLogical)[]
}
