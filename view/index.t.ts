/**
 * Типы для представления (View)
 * @packageDocumentation
 * @module View
 */

import type { ContextSchema, Update, ExtractValues } from "../context"
import type { map } from "../html/directives/map"
import type { ref } from "../html/directives/ref"
import type { repeat } from "../html/directives/repeat"
import type { styleMap } from "../html/directives/style-map"
import type { when } from "../html/directives/when"
import type { html } from "../html/html"
import type { TemplateResult } from "../html/html.t"

/**
 * Параметры функции рендеринга представления актора.
 *
 * В функцию render компонента MetaFor передаётся объект с полезными утилитами и данными для построения UI.
 *
 * @includeExample view/test/context.init.spec.ts
 * @includeExample view/test/context.update.spec.ts
 *
 * @example
 * ```ts
 * render({ context, update, state, html, ref, repeat, when, map, style }) {
 *   const inputRef = ref();
 *   return html`
 *     <div ${style({ color: state === 'error' ? 'red' : 'black' })}>
 *       <h2>${context.title}</h2>
 *       <input ${ref(inputRef)} value=${context.value} @input=${e => update({ value: e.target.value })} />
 *       <ul>
 *         ${repeat(context.items, (item, i) => html`<li>${i}: ${item}</li>`)}
 *       </ul>
 *       ${when(context.items.length > 0, () => html`<span>Есть элементы</span>`, () => html`<span>Пусто</span>`)}
 *       <ol>
 *         ${map(context.items, (item, i) => html`<li>${item}</li>`)}
 *       </ol>
 *     </div>
 *   `;
 * }
 * ```
 */

export type ViewDefinitionParams<C extends ContextSchema, S extends string> = {
  /**
   * Функция для обновления контекста.
   * Вызывается с частичным объектом контекста для изменения состояния.
   * @example
   * ```ts
   * update({ value: 42 })
   * ```
   */
  update: Update<C>
  /**
   * Текущее состояние контекста.
   * Содержит все поля, определённые в .context(...)
   * @example
   * ```ts
   * html`<div>${context.value}</div>`
   * ```
   */
  context: ExtractValues<C>
  /**
   * Текущее состояние автомата/актора.
   * Обычно строка, определённая в .states(...)
   * @example
   * ```ts
   * html`<span>${state === 'error' ? 'Ошибка' : 'Ок'}</span>`
   * ```
   */
  state: S
  /**
   * Функция шаблонизации (аналог lit-html).
   * Используется для создания HTML-шаблонов с интерполяцией.
   * @example
   * ```ts
   * html`<div>${context.value}</div>`
   * ```
   */
  html: typeof html
  /**
   * Директива для получения ссылки на DOM-элемент.
   * Используется для доступа к элементу после рендера.
   * @example
   * ```ts
   * const r = ref();
   * html`<input ${ref(r)} />`
   * // r.value будет содержать DOM-элемент
   * ```
   */
  ref: typeof ref
  /**
   * Директива для эффективного рендера списков с ключами.
   * Позволяет оптимально обновлять DOM при изменении массива.
   * @example
   * ```ts
   * html`<ul>${repeat(context.items, (item, i) => html`<li>${i}: ${item}</li>`)}</ul>`
   * ```
   *
   * Или возвращать напрямую:
   * ```ts
   * return repeat(context.items, (item, i) => html`<li>${i}: ${item}</li>`)
   * ```
   */
  repeat: typeof repeat
  /**
   * Директива для условного рендера.
   * Позволяет элегантно отображать разные шаблоны в зависимости от условия.
   * @example
   * ```ts
   * html`<div>${when(flag, () => html`<span>Да</span>`, () => html`<span>Нет</span>`)}</div>`
   * ```
   *
   * Или возвращать напрямую:
   * ```ts
   * return when(flag, () => html`<span>Да</span>`, () => html`<span>Нет</span>`)
   * ```
   */
  when: typeof when
  /**
   * Директива для простого отображения массива в элементы.
   * Удобна для простых случаев, когда не нужны ключи.
   * @example
   * ```ts
   * html`<ul>${map(items, (item, i) => html`<li>${item}</li>`)}</ul>`
   * ```
   *
   * Или возвращать напрямую:
   * ```ts
   * return map(items, (item, i) => html`<li>${item}</li>`)
   * ```
   */
  map: typeof map
  /**
   * Директива для применения inline-стилей к элементу.
   * Позволяет динамически задавать стили через объект.
   * @example
   * ```ts
   * html`<div ${style({ color: 'red', fontWeight: 600 })}></div>`
   * ```
   */
  style: typeof styleMap
}

/**
 * Конфигурация для представления компонента.
 *
 * Поддерживает передачу контекста между компонентами через атрибут `context`.
 * При первой отрисовке контекст устанавливается без дополнительных сообщений,
 * при обновлении контекста родителя автоматически обновляется контекст ребенка.
 *
 * @includeExample view/test/context.init.spec.ts
 * @includeExample view/test/context.update.spec.ts
 */
export interface ViewConfig<C extends ContextSchema, S extends string> {
  /**
   * Функция рендеринга компонента.
   * Получает параметры с контекстом, состоянием и утилитами для построения UI.
   *
   * Поддерживает передачу контекста дочерним компонентам через атрибут `context`:
   * ```ts
   * render: ({ context, html }) => html`
   *   <div>
   *     <h1>Родитель: ${context.parentMessage}</h1>
   *     <metafor-child
   *       context=${{
   *         message: context.parentMessage,
   *         count: context.parentCount,
   *       }}></metafor-child>
   *   </div>
   * `
   * ```
   */
  render?: (params: ViewDefinitionParams<C, S>) => TemplateResult
  /**
   * Функция, вызываемая после монтирования компонента в DOM.
   * Используется для инициализации после рендера.
   */
  onMount?: (...args: unknown[]) => unknown
  /**
   * Функция, вызываемая при уничтожении компонента.
   * Используется для очистки ресурсов.
   */
  onDestroy?: (...args: unknown[]) => unknown
  /**
   * Функция для определения CSS-стилей компонента.
   * Получает функцию css для создания инкапсулированных стилей.
   */
  style?: ({ css }: { css: (strings: TemplateStringsArray, ...values: any[]) => CSSStyleSheet }) => void
}
