/**
 * Шаблонизатор MetaFor — парсер HTML-шаблонов для декларативного рендеринга.
 *
 * ## Архитектура
 *
 * Модуль преобразует template-функции в типизированное AST с метаданными о путях к данным.
 * Поддерживает:
 * - HTML элементы с атрибутами (статические и динамические)
 * - Template literals с переменными `${...}`
 * - Map операции для итерации по коллекциям
 * - Условные операторы (тернарные и логические)
 * - Вложенные структуры любой сложности
 * - События и динамические атрибуты
 * - Web Components через `<meta-*>` теги
 *
 * ## Конвейер парсинга
 *
 * 1. **Извлечение HTML** — `extractMainHtmlBlock()` извлекает содержимое из `html`...`
 * 2. **Построение иерархии** — `extractHtmlElements()` создаёт промежуточное представление
 * 3. **Обогащение узлами** — `createNode()` преобразует в финальное AST с путями к данным
 *
 * ## Формат путей к данным
 *
 * - `/fields/...` — доступ к полям контекста
 * - `/mass/...` — доступ к mass объекту
 * - `[item]/...` — доступ к элементу итерации в map
 * - `[index]` — индекс элемента в map
 * - `../` — переход к родительскому контексту map
 *
 * @packageDocumentation
 */
import { createNode } from "./node"
import type { NodeType } from "./node/index.t"
import type { Params, Fields, Mass, State } from "./index.t"
import type { NodeMeta } from "./node/meta.t"
import type { NodeLogical } from "./node/logical.t"
import type { NodeMap } from "./node/map.t"
import { extractHtmlElements } from "./parser"

export type { NodeType as Node, NodeMeta, NodeLogical, NodeMap }

/**
 * Парсит HTML-шаблон и возвращает обогащенную иерархию с метаданными о путях к данным.
 *
 * @param template - Template-функция, принимающая `{ html, fields, mass, state, update }`.
 * Функция должна возвращать результат вызова `html`...`` (template literal).
 *
 * @returns Массив корневых узлов AST с полной структурой и метаданными о путях к данным.
 *
 * @throws Error если функция не содержит `html`...`` блока
 *
 * @example
 * ```typescript
 * const ast = parse(({ html, fields }) => html`
 *   <div class="${fields.className}">
 *     <h1>${fields.title}</h1>
 *     ${fields.items.map(item => html`<li>${item.name}</li>`)}
 *   </div>
 * `)
 * ```
 */
export const parse = <F extends Fields = Fields, M extends Mass = Mass, S extends State = State>(
  template: (params: Params<F, M, S>) => void,
): NodeType[] => {
  const mainHtml = extractMainHtmlBlock(template)
  const hierarchy = extractHtmlElements(mainHtml)
  const context = { pathStack: [], level: 0 }
  return hierarchy.map((node) => createNode(node, context))
}

const extractMainHtmlBlock = (template: (params: Params<any, any, any>) => void): string => {
  const src = Function.prototype.toString.call(template)
  const firstIndex = src.indexOf("html`")
  if (firstIndex === -1) throw new Error("функция template не содержит html`")
  const lastBacktick = src.lastIndexOf("`")
  if (lastBacktick === -1 || lastBacktick <= firstIndex) throw new Error("template function does not contain html`")
  const htmlContent = src.slice(firstIndex + 5, lastBacktick)
  return htmlContent.replace(/!0/g, "true").replace(/!1/g, "false")
}
