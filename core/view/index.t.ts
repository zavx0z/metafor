/**
 * Типы для представления (View)
 * @packageDocumentation
 * @module View
 */

import type { ContextSchema, Update, ExtractValues } from "../context"
import type { Core } from "../index.t"

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

export type ViewDefinitionParams<C extends ContextSchema, S extends string, I extends Core> = {
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
  core: I
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
  html: (strings: TemplateStringsArray, ...values: any[]) => void
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
export interface ViewDeclaration<C extends ContextSchema, S extends string, I extends Core> {
  /**
   * Функция рендеринга компонента.
   * Получает параметры с контекстом, состоянием и утилитами для построения UI.
   *
   * Поддерживает передачу контекста дочерним компонентам через атрибут `context`:
   * ```ts
   * render: ({ context, html }) => html`
   *   <div>
   *     <h1>Родитель: ${context.parentMessage}</h1>
   *     <meta-child
   *       context=${{
   *         message: context.parentMessage,
   *         count: context.parentCount,
   *       }}></meta-child>
   *   </div>
   * `
   * ```
   */
  render?: RenderFunc<C, S, I>
  /**
   * Функция, вызываемая после монтирования компонента в DOM.
   * Используется для инициализации после рендера.
   */
  onMount?: ({ core }: { core: I }) => void
  /**
   * Функция, вызываемая при уничтожении компонента.
   * Используется для очистки ресурсов.
   */
  onDestroy?: ({ core }: { core: I }) => void
  /**
   * Функция для определения CSS-стилей компонента.
   * Получает функцию css для создания инкапсулированных стилей.
   */
  style?: ({ css }: { css: (strings: TemplateStringsArray, ...values: any[]) => void }) => void
}

export type RenderFunc<C extends ContextSchema, S extends string, I extends Core> = (
  params: ViewDefinitionParams<C, S, I>
) => void
