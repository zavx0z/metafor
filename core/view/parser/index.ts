import { extractMainHtmlBlock, extractHtmlElements } from "./splitter"
import { makeHierarchy } from "./hierarchy"
import { extractAttributes } from "./attributes"
import { enrichWithData } from "./data"
import type { Node } from "./index.t"
import type { RenderParams, Context, Core, State } from "./index.t"

/**
 * Парсит HTML-шаблон и возвращает обогащенную иерархию с метаданными о путях к данным.
 *
 * Эта функция является основным публичным API парсера. Она принимает render-функцию
 * и выполняет полный цикл обработки:
 * 1. Извлекает основной HTML блок из template literal
 * 2. Разбивает HTML на токены элементов
 * 3. Строит иерархию элементов с поддержкой map и условий
 * 4. Обогащает иерархию метаданными о путях к данным, выражениях и статических значениях
 *
 * Поддерживает все возможности парсера:
 * - HTML элементы с атрибутами
 * - Template literals с переменными ${...}
 * - Map операции для итерации по коллекциям
 * - Условные операторы (тернарные)
 * - Вложенные структуры любой сложности
 * - События и динамические атрибуты
 * - Web Components
 *
 * @param render - Render-функция вида ({ html, context, core, state }) => html`...`
 * @returns Обогащенная иерархия с метаданными о путях к данным
 *
 * @example
 * ```typescript
 * // Простой HTML с переменными
 * const result = parse(({ html, context }) => html`
 *   <div class="${context.userStatus}">
 *     <h1>Hello ${context.userName}!</h1>
 *     <p>You have ${context.messageCount} messages</p>
 *   </div>
 * `)
 *
 * // HTML с map операциями
 * const result = parse(({ html, context }) => html`
 *   <ul>
 *     ${context.users.map((user) => html`
 *       <li class="${user.active ? 'active' : 'inactive'}">
 *         ${user.name} - ${user.email}
 *       </li>
 *     `)}
 *   </ul>
 * `)
 *
 * // HTML с условиями
 * const result = parse(({ html, context }) => html`
 *   <div>
 *     ${context.isAdmin ? html`
 *       <button onclick="${() => context.adminPanel.open()}">Admin Panel</button>
 *     ` : html`
 *       <span>Access denied</span>
 *     `}
 *   </div>
 * `)
 * ```
 */
export const parse = <C extends Context, I extends Core, S extends State>(
  render: (params: RenderParams<C, I, S>) => void
): Node[] => {
  // Извлекаем основной HTML блок из render-функции
  const mainHtml = extractMainHtmlBlock(render)

  // Разбиваем HTML на токены элементов
  const elements = extractHtmlElements(mainHtml)

  // Строим иерархию элементов
  const hierarchy = makeHierarchy(mainHtml, elements)

  // Извлекаем атрибуты
  const attributes = extractAttributes(hierarchy)

  // Обогащаем иерархию метаданными о путях к данным
  const enrichedHierarchy = enrichWithData(attributes)

  return enrichedHierarchy
}
