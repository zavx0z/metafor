import type { PartAttrMap } from "./map.t.ts"
import type { PartAttrCondition } from "./condition.t.ts"
import type { PartAttrElement } from "./element.t.ts"
import type { NodeType } from "./index.t.ts"
import type { PartAttrMeta } from "./meta.t.ts"

/**
 * Узел логического оператора в AST.
 * Представляет логический оператор && с условным отображением.
 *
 * @group Nodes
 * @example Простое логическое условие
 * ```html
 * <div>
 *   ${fields.isAdmin && html`<button>Админ-панель</button>`}
 * </div>
 * ```
 *
 * Результат:
 * ```json
 * {
 *   "tag": "div",
 *   "type": "el",
 *   "child": [
 *     {
 *       "type": "log",
 *       "data": "/fields/isAdmin",
 *       "child": [
 *         {
 *           "tag": "button",
 *           "type": "el",
 *           "child": [
 *             {
 *               "type": "text",
 *               "value": "Админ-панель"
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 * ```
 *
 * @example Логическое условие с проверкой массива
 * ```html
 * <div>
 *   ${mass.notifications.length > 0 && html`
 *     <div class="notifications">
 *       ${mass.notifications.map(n => html`<div>${n.message}</div>`)}
 *     </div>
 *   `}
 * </div>
 * ```
 *
 * Результат:
 * ```json
 * {
 *   "tag": "div",
 *   "type": "el",
 *   "child": [
 *     {
 *       "type": "log",
 *       "data": "/mass/notifications.length",
 *       "expr": "${[0]} > 0",
 *       "child": [
 *         {
 *           "tag": "div",
 *           "type": "el",
 *           "string": {
 *             "class": "notifications"
 *           },
 *           "child": [
 *             {
 *               "type": "map",
 *               "data": "/mass/notifications",
 *               "child": [
 *                 {
 *                   "tag": "div",
 *                   "type": "el",
 *                   "child": [
 *                     {
 *                       "type": "text",
 *                       "data": "[item]/message"
 *                     }
 *                   ]
 *                 }
 *               ]
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 * ```
 *
 * ### Сложное логическое условие
 *
 * {@includeCode ./logical.spec.ts#parse}
 * {@includeCode ./logical.spec.ts#expect}
 *
 * Структура узла:
 * - `type` - всегда "log" для логических операторов
 * - `data` - путь(и) к данным для условия
 * - `expr` - выражение с индексами (если условие сложное)
 * - `child` - дочерние узлы, которые отображаются только если условие истинно
 */

export interface NodeLogical {
  /** Тип узла - всегда "log" для логических операторов */
  type: "log"
  /**
   * Путь(и) к данным для условия
   *
   * @example Простой путь
   * ```typescript
   * data: "/fields/isAdmin"
   * ```
   *
   * ---
   *
   * @example Массив путей
   * ```typescript
   * data: ["/fields/notifications", "/fields/count"]
   * ```
   */
  data: string | string[]
  /**
   * Выражение с индексами (если условие сложное)
   *
   * @example
   * ```typescript
   * expr: "${[0]} === 'admin' && ${[1]}.includes('delete')"
   * ```
   */
  expr?: string
  /** Дочерние узлы, которые отображаются только если условие истинно */
  child: NodeType[]
}
export type TokenLogicalOpen = { kind: "log-open"; expr: string }
export type PartAttrLogical = {
  /** Тип узла */
  type: "log"
  /** Исходный текст логического выражения */
  text: string
  /** Дочерние элементы, которые отображаются только если условие истинно */
  child: (PartAttrElement | PartAttrMeta | PartAttrCondition | PartAttrMap | PartAttrLogical)[]
}
