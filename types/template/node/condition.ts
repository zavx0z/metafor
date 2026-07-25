import type { PartAttrMap } from "./map.ts"
import type { PartAttrElement } from "./element.ts"
import type { NodeType } from "./index.ts"
import type { PartAttrMeta } from "./meta.ts"

/**
 * Узел условного оператора в AST.
 * Представляет тернарный оператор с ветками true и false.
 *
 * ## Структура child-массива
 *
 * Массив `child` всегда содержит 2 элемента:
 * - `child[0]` — ветка true (условие истинно)
 * - `child[1]` — ветка false (условие ложно)
 *
 * @group Nodes
 * @example Простое условие
 * ```html
 * <div>
 *   ${fields.isLoggedIn ? html`<span>Добро пожаловать, ${fields.name}!</span>` : html`<a href="/login">Войти</a>`}
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
 *       "type": "cond",
 *       "data": "/fields/isLoggedIn",
 *       "child": [
 *         {
 *           "tag": "span",
 *           "type": "el",
 *           "child": [
 *             {
 *               "type": "text",
 *               "data": "/fields/name",
 *               "expr": "Добро пожаловать, ${[0]}!"
 *             }
 *           ]
 *         },
 *         {
 *           "tag": "a",
 *           "type": "el",
 *           "string": { "href": "/login" },
 *           "child": [{ "type": "text", "value": "Войти" }]
 *         }
 *       ]
 *     }
 *   ]
 * }
 * ```
 *
 * @example Сложное условие
 * ```html
 * <div>
 *   ${value.role === 'admin' && value.canWrite ?
 *     html`<button>Редактировать</button>` :
 *     html`<span>Нет прав</span>`
 *   }
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
 *       "type": "cond",
 *       "data": ["/value/role", "/value/canWrite"],
 *       "expr": "${[0]} === 'admin' && ${[1]}",
 *       "child": [
 *         { "tag": "button", "type": "el", "child": [{ "type": "text", "value": "Редактировать" }] },
 *         { "tag": "span", "type": "el", "child": [{ "type": "text", "value": "Нет прав" }] }
 *       ]
 *     }
 *   ]
 * }
 * ```
 */
export interface NodeCondition {
  /** Тип узла — всегда `"cond"` для условных операторов */
  type: "cond"
  /**
   * Путь(и) к данным для условия.
   *
   * Простой путь для одного условия или массив путей для сложного выражения.
   */
  data: string | string[]
  /**
   * Выражение с индексами для сложного условия.
   *
   * Индексы (`_[0]`, `_[1]`) ссылаются на элементы массива `data`.
   * Отсутствует для простых условий (например, `fields.isLoggedIn`).
   */
  expr?: string
  /**
   * Дочерние узлы для веток true/false.
   *
   * - `child[0]` — ветка true (условие истинно)
   * - `child[1]` — ветка false (условие ложно)
   */
  child: NodeType[]
}
export interface TokenCondClose { kind: "cond-close" }
export interface TokenCondElse { kind: "cond-else" }
export interface TokenCondOpen { kind: "cond-open"; expr: string }
export interface PartAttrCondition {
  /** Тип узла — `"cond"` для условных операторов */
  type: "cond"
  /** Исходный текст условия (например, `"fields.isLoggedIn ? html`...` : html`...`"`) */
  text: string
  /**
   * Элементы для веток true/false.
   *
   * - `child[0]` — ветка true
   * - `child[1]` — ветка false
   */
  child: (PartAttrElement | PartAttrMeta | PartAttrCondition | PartAttrMap)[]
}
